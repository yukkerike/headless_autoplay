const { Logger } = require('sq-lib')
const {
    waitForResult,
    executeAndWait,
    composeLogin,
    input,
    sleep,
    createClient,
    experienceToLevel,
    canJoinToLocation,
    searchMaxLocationIdForLevel
} = require('./helpers')

Logger.setOptions({ logFile: 0, debug: 0, info: 1, warn: 1, error: 1, fatal: 1 })

function log(...args) {
    let date = new Date().toLocaleTimeString('ru-RU', { hour12: false, 
        hour: "numeric", 
        minute: "numeric",
        second: "numeric" })
    Logger.info('net', date, ...args)
}

const guardReference = Buffer.from([6,0,0,0,2,0,0,0,0,0])

class Player {
    self = {
        uid: null
    }
    inRoom = false
    locationId = 0
    moderatorsOnline = false
    rooms = []
    coins = 0
    nuts = 0
    pingInterval = null
    energyInterval = null
    vipExpirationTimeout = null
    hasVip = false
    subleader = false
    canRefineEnergy = false
    date = 0

    room = {
        mapDuration: 0,
        playerCount: 0
    }

    settings = {
        reconnect: true,
        reconnectForDailyBonus: false,
        session: "",
        log: false,
        autoPlay: true,
        joinId: null,
        playInClan: true,
        paranoidMode: false,
        roomId: null,
        changeRooms: null,
        clanIdToJoin: null,
        locationId: 4,
        surrender: false,
        checkModerators: true,
        buyVIP: false,
        donateLevel: null,
    }

    constructor(host, ports, settings = {}) {
        this.host = host
        this.ports = ports
        this.settings = { ...this.settings, ...settings }
        this.settings.paranoidMode = this.settings.joinId ? false : this.settings.paranoidMode
        this.openConnection()
    }

    openConnection() {
        const client = createClient(this.host, this.ports)
        this.client = client
        client.on('client.connect', () => this.handleConnect(client))
        client.on('client.close', () => this.handleClose(client))
        client.on('packet.incoming', (packet, buffer) => this.handlePacket(client, packet, buffer))
        client.on('packet.incoming', (packet, buffer) => this.logPacket(packet, buffer, 0))
        client.on('packet.outcoming', (packet, buffer) => this.logPacket(packet, buffer, 1))
        client.setMaxListeners(0)
        client.open()
    }

    logPacket(packet, buffer, out) {
        if (out) {
            clearInterval(this.pingInterval)
            this.pingInterval = setInterval(() => {
                this.client.sendData('PING', 0)
            }, 30000)
        }
        if (this.settings.logNet)
            log(this.self.uid, packet, JSON.stringify(buffer))
    }

    handleClose() {
        log(this.self.uid, 'Сервер закрыл соединение')
        if (this.settings.reconnect) {
            log(this.self.uid, 'Переподключаемся')
            this.rooms = []
            this.inRoom = false
            this.openConnection()
        }
    }

    dump() {
        console.log('ID: ' + this.self.uid + '\nУровень: ' + this.self.level + '\nЭнергия: ' + this.energy + '\nОрехи: ' + this.nuts + '\nМонеты: ' + this.coins + '\nВ комнате: ' + (this.inRoom ? 'Да' : 'Нет'))
    }

    getDate() {
        return new Date(Date().toLocaleString('en-en', {timeZone: 'Europe/Moscow'})).getDate()
    }

    async handleConnect(client) {
        this.date = this.getDate()
        client.sendData('HELLO')
        let login = { data: { status: 2 } }
        while (login.data.status === 2) {
            login = await executeAndWait(
                client,
                () => client.sendData('LOGIN', ...composeLogin(this.settings.session)),
                'packet.incoming',
                'PacketLogin',
                1000)
        }
        this.self.uid = login.data.innerId
        if (this.self.uid === this.settings.joinId) this.settings.joinId = null
        if (login.data.status !== 0) {
            log(this.self.uid, 'Закрываем сокет')
            this.settings.reconnect = false
            client.close()
            return
        } else log(this.self.uid, 'статус логина:' + login.data.status)
        // sq-lib/shared/PlayerInfoData.js Список полей для получения информации об игроке, объединяются через логическое ИЛИ
        try {
            this.self = (await executeAndWait(
                client,
                () => client.sendData('REQUEST', [[this.self.uid]], 148744),
                'packet.incoming',
                packet => packet.type === 'PacketInfo' && packet.data.data[0].uid === this.self.uid,
                2000)
            ).data.data[0]
        } catch (e) {
            console.log(e)
            client.close()
        }
        client.sendData('AB_GUI_ACTION', 0)
        this.getSurrender().then(canSurrender => {
            if (this.settings.surrender) this.settings.surrender = canSurrender
            if (!canSurrender) log(this.self.uid, 'Капитуляция не прокачана')
        })
        this.self.level = experienceToLevel(this.self.exp)
        this.donateAndLeave(client)
        if (this.settings.clanIdToJoin && this.self.clan_id === 0) {
            client.sendData('CLAN_REQUEST', [[this.settings.clanIdToJoin]], 32767)
        }
        if (this.settings.autoPlay)
            this.startAutoplay(client)
    }

    async getSurrender() {
        const skills = this.self.shaman_skills
        for (let i = 0; i < skills.length; i++)
            if (skills[i].skillId === 21 && (skills[i].levelFree > 0 || skills[i].levelPaid > 0))
                return true
        return false
    }

    async checkModerators(client) {
        if (!this.settings.checkModerators) return
        const ids = [[7], [22], [125330], [427140], [1452374], [4895807], [9419562], [9419675], [9479297], [11231704], [17986739]]
        try {
            var online = (await executeAndWait(
                client,
                () => client.sendData('REQUEST', ids, 64),
                'packet.incoming',
                'PacketInfo',
                1000)).data.data
        } catch (e) {
            log(this.self.uid, 'Ошибка при получении списка модераторов в сети, отсутствует интернет.')
            return
        }
        const isOnline = online.filter(id => id.online === 1).length > 0
        if (!isOnline && this.moderatorsOnline && !this.inRoom) {
            log(this.self.uid, 'Модератор вышел из сети, заходим в комнату')
            this.startRound(client)
        }
        if (this.settings.surrender && isOnline && this.inRoom) {
            log(this.self.uid, 'Модератор вошел в сеть, прекращаем капитуляцию и выходим из комнаты')
            this.settings.surrender = false
            client.sendData('LEAVE')
        }
        this.moderatorsOnline = isOnline
    }

    donateAndLeave(client) {
        if (this.settings.donateLevel && this.self.clan_id && this.self.level >= this.settings.donateLevel) {
            log(this.self.uid, 'Получен лвл ' + this.self.level + ', вкладываем в клан все ресурсы и выходим')
            client.sendData('CLAN_DONATION', this.coins, this.nuts)
            client.sendData('CLAN_LEAVE')
            this.settings.reconnect = false
            client.close()
        }
    }

    claimBonus(client, day) {
        if ((day === 1 || day === 4) && this.settings.autoPlay) {
            this.canRefineEnergy = true
            return
        }
        client.sendData('EVERY_DAY_BONUS_GET')
    }

    handlePacket(client, packet, buffer) {
        switch (packet.type) {
            case 'PacketRoundShaman':
                if (!this.settings.surrender || !this.settings.autoPlay) break
                const shamans = packet.data.playerId
                shamans.map(shaman => {
                    if (shaman === this.self.uid && this.room.playerCount > 1)
                        client.sendData('ROUND_SKILL_SHAMAN', 20, true)
                })
                break
            case 'PacketDailyBonusData':
                if (packet.data.haveBonus) this.claimBonus(client, packet.data.day)
                break
            case 'PacketClanInfo':
                if (packet.data.data[0].id === this.settings.clanIdToJoin)
                    this.clanLevelLimiter = packet.data.data[0].level_limiter
                break
            case 'PacketClanJoin':
                if (packet.data.playerId === this.self.uid) {
                    log(this.self.uid, 'Заявка в клан одобрена')
                    this.self.clan_id = packet.data.clanId
                    this.loadRooms(client)
                }
                break
            case 'PacketClanSubstitute':
                if (packet.data.playerIds.indexOf(this.self.uid) !== -1) {
                    this.subleader = true
                    client.sendData('CLAN_GET_APPLICATION')
                }
                break
            case 'PacketClanApplication':
                if (packet.data.items.length > 0) log(this.self.uid, 'Получена заявка в клан')
                packet.data.items.forEach(id => global.clients.forEach(player => {
                    if (player.self.uid === id.playerId) {
                        client.sendData('CLAN_ACCEPT', [[id.playerId]], 1)
                        log(this.self.uid, 'Принял заявку в клан от ' + id.playerId)
                    }
                }))
                break
            case 'PacketExperience':
                this.self.level = experienceToLevel(this.self.exp)
                this.donateAndLeave(client)
                break
            case 'PacketEnergy':
                this.energy = packet.data.energy
                clearInterval(this.energyInterval)
                this.energyInterval = setInterval(() => {
                    if (this.energy < this.energyLimit)
                        this.energy += this.hasVip ? 2 : 1
                }, 62000)
                if (this.settings.buyVIP && !this.hasVip && this.coins >= 10 && this.energy < 10) {
                    client.sendData('BUY', 45, 10, 0, this.self.uid, 0)
                    log(this.self.uid, 'Закуплен VIP на сутки')
                }
                if (this.energy < 10) {
                    this.canRefineEnergy = false
                    this.claimBonus(client)
                }
                break
            case 'PacketExpirations':
                packet.data.items.forEach(item => {
                    if (item.type === 2 && item.duration > 0) {
                        clearTimeout(this.vipExpirationTimeout)
                        this.hasVip = true
                        log(this.self.uid, 'Имеется VIP на ' + item.duration + ' секунд')
                        this.vipExpirationTimeout = setTimeout(() => this.hasVip = false, item.duration * 1000)
                    }
                })
                break
            case 'PacketEnergyLimits':
                this.energyLimit = packet.data.energy
                break
            case 'PacketClanPrivateRooms':
                this.rooms = packet.data.items
                break
            case 'PacketGuard':
                if (Buffer.compare(buffer, guardReference) !== 0) {
                    log(this.self.uid, 'Текущая версия автоплеера не может решать квизы, присылаемые с сервера, ожидайте обновлений.')
                    process.exit()
                }
                client.sendData('GUARD', [])
                break
            case 'PacketRoom':
                client.sendData('ROUND_ALIVE')
                this.inRoom = true
                this.locationId = packet.data.locationId
                this.isPrivate = packet.data.isPrivate
                this.aliveTimer = setInterval(() => client.sendData('ROUND_ALIVE'), 5000)
                this.room.playerCount = packet.data.players.length + 1
                if (this.settings.paranoidMode && this.room.playerCount > 1) {
                    log(this.self.uid, 'Включен параноидальный режим, выходим.')
                    client.sendData('LEAVE')
                }
                if (packet.data.players.length)
                    log(this.self.uid, 'В комнате находятся ' + packet.data.players)
                break
            case 'PacketRoomRound':
                if (packet.data.mapDuration > 0)
                    this.room.mapDuration = packet.data.mapDuration
                client.sendData('AB_GUI_ACTION', 0)
                if (this.settings.autoPlay && packet.data.type === 4) {
                    log(this.self.uid, 'Начало раунда')
                    setTimeout(() => {
                        this.toHollow(client)
                    }, this.settings.surrender && this.room.playerCount > 1 ? (this.room.mapDuration - 10) * 1000 : 4000)
                }
                break
            case 'PacketRoundDie':
                if (packet.data.playerId === this.self.uid)
                    client.sendData('AB_GUI_ACTION', 1)
                break
            case 'PacketRoundHollow':
                if (packet.data.success === 1 && packet.data.playerId === this.self.uid) {
                    log(this.self.uid, 'В дупле')
                    client.sendData('AB_GUI_ACTION', 1)
                }
                if(this.settings.reconnectForDailyBonus && this.date !== this.getDate()) {
                    let old_reconnect = this.settings.reconnect
                    this.settings.reconnect = true
                    client.close()
                    this.settings.reconnect = old_reconnect
                    return
                }
                if (!this.self.clan_id && this.self.level >= 8 && this.self.level >= this.clanLevelLimiter && !(this.settings.donateLevel && this.self.level >= this.settings.donateLevel))
                    client.sendData('CLAN_JOIN', [this.settings.clanIdToJoin])
                if (this.settings.playInClan && !this.isPrivate && this.self.clan_id && this.rooms.length > 0) {
                    log(this.self.uid, 'Найдены непустые комнаты в клане, переходим в них')
                    client.sendData('LEAVE')
                    this.startRound(client)
                }
                if (this.locationId !== this.settings.locationId && !this.isPrivate && this.locationId !== searchMaxLocationIdForLevel(this.self.level)) {
                    log(this.self.uid, 'Доступны более высокие локации, переходим в них')
                    client.sendData('LEAVE')
                    this.startRound(client)
                }
                break
            case 'PacketRoomJoin':
                this.room.playerCount++
                log(this.self.uid, 'Присоединился к комнате игрок ' + packet.data.playerId)
                if (this.settings.paranoidMode && this.room.playerCount > 1) {
                    log(this.self.uid, 'Включен параноидальный режим, выходим.')
                    client.sendData('LEAVE')
                }
                break
            case 'PacketRoomLeave':
                this.room.playerCount--
                if (packet.data.playerId === this.settings.joinId) {
                    log(this.self.uid, 'Игрок ' + this.settings.joinId + ' вышел из комнаты, выходим тоже.')
                    client.sendData('LEAVE')
                    return
                }
                if (packet.data.playerId !== this.self.uid) {
                    log(this.self.uid, 'Покинул комнату игрок ' + packet.data.playerId)
                    break
                }
                clearInterval(this.aliveTimer)
                this.inRoom = false
                log(this.self.uid, 'Выход из комнаты')
                break
            case 'PacketBalance':
                this.nuts = packet.data.nuts
                this.coins = packet.data.coins
                if (this.nuts >= 2147483500) {
                    this.settings.surrender = false
                    log(this.self.uid, 'Остановлен автокап во избежание обнуления орехов')
                }
                break
        }
    }

    toHollow(client) {
        log(this.self.uid, 'Заход в дупло')
        client.sendData('ROUND_NUT', 0)
        client.sendData('ROUND_HOLLOW', 0)
        client.sendData('AB_GUI_ACTION', 1)
        if (this.settings.checkModerators && this.moderatorsOnline) {
            client.sendData('LEAVE')
            log(this.self.uid, 'Модератор в сети, выходим из комнаты')
        } else if (this.rooms.length > 1) {
            client.sendData('LEAVE')
            this.inRoom = false
            log(this.self.uid, 'Меняем комнату для ускорения автокача')
            this.startRound(client)
        }
    }

    async loadRooms(client) {
        if (this.self.clan_id !== 0)
            this.rooms = (await executeAndWait(client, () => client.sendData('CLAN_GET_ROOMS'), 'packet.incoming', 'PacketClanPrivateRooms')).data.items
    }

    async startAutoplay(client) {
        console.log('Запускаем автоплеер')
        await this.checkModerators(client)
        setInterval(() => this.checkModerators(client), 10000)
        this.startRound(client)
        setInterval(() => this.startRound(client), 60000)
    }

    getRoomWithMinPlayers(rooms) {
        if (this.settings.surrender) return rooms[0]
        let minPlayers = 14
        let minRoom = null
        rooms.forEach(room => {
            if (room.playersCount < minPlayers && (this.rooms.length > 1 || room != this.settings.roomId)) {
                if (this.settings.paranoidMode && room.playersCount > 0) return
                minPlayers = room.playersCount
                minRoom = room
            }
        })
        return minRoom ? minRoom.roomId : null
    }

    async startRound(client) {
        if (this.inRoom || (this.settings.checkModerators && this.moderatorsOnline) || this.energy < 10) return
        if (this.settings.joinId > 0) {
            try {
                log(this.self.uid, 'Вход за', this.settings.joinId)
                const playWith = await executeAndWait(
                    client,
                    () => client.sendData('PLAY_WITH', this.settings.joinId),
                    'packet.incoming',
                    'PacketPlayWith',
                    200
                )
                if ([0, 1, 2, 3].indexOf(playWith.data.type) !== -1) {
                    log(this.self.uid, 'Невозможно присоединиться, статус:' + playWith.data.type + ', повторение через 10 секунд')
                    setTimeout(() => this.startRound(client), 10000)
                    return
                }
            } catch (e) {
                // Зашли
            }
        }
        if (this.settings.playInClan && this.self.clan_id) {
            await this.loadRooms(client)
            if (!this.settings.roomId || this.settings.changeRooms || this.rooms.filter(room => room.roomId === this.settings.roomId).length === 0) {
                if (this.rooms.length === 0) {
                    log(this.self.uid, 'Нет доступных комнат')
                    return
                }
                var rooms = this.rooms.filter(room => room.locationId === this.settings.locationId)
                if (rooms.length !== 0) {
                    this.settings.roomId = this.getRoomWithMinPlayers(rooms.length > 1 ? rooms.filter(room => room.roomId !== this.settings.roomId) : rooms)
                    this.rooms = rooms
                } else {
                    log(this.self.uid, 'Нет доступных комнат заданного типа, выбираем первую доступную с наименьшим числом игроков')
                    this.settings.roomId = this.getRoomWithMinPlayers(this.rooms)
                }
            }
            if (this.settings.roomId) {
                client.sendData('PLAY_ROOM', this.settings.roomId)
                log(this.self.uid, 'Вход в комнату', this.settings.roomId)
                return
            }
        }
        if (this.settings.locationId > 0 && !this.self.clan_id && canJoinToLocation(this.settings.locationId, this.self.level)) {
            client.sendData('PLAY', this.settings.locationId, 0)
            log(this.self.uid, 'Поиск комнаты')
        } else {
            const id = searchMaxLocationIdForLevel(this.self.level)
            client.sendData('PLAY', id, 0)
            log(this.self.uid, 'Заходим в локацию с максимально высоким минимальным уровнем, id:' + id)
        }
    }
}

module.exports = Player