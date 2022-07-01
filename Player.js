const {Logger} = require('sq-lib')
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

const log = Logger.info
Logger.setOptions({logFile: 0, debug: 0, info: 1, warn: 1, error: 1, fatal: 1})

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
    energyInterval = null
    hasVip = false
    subleader = false

    room = {
        mapDuration: 0,
        playerCount: 0
    }

    settings = {
        reconnect: true,
        session: "",
        log: false,
        autoPlay: true,
        joinId: null,
        playInClan: true,
        roomId: null,
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
        this.settings = {...this.settings, ...settings}
        this.openConnection()
    }

    openConnection(){
        const client = createClient(this.host, this.ports)
        this.client = client
        client.on('client.connect', () => this.handleConnect(client))
        client.on('client.close', () => this.handleClose(client))
        client.on('packet.incoming', (packet, buffer) => this.handlePacket(client, packet, buffer))
        client.on('packet.incoming', (packet, buffer) => this.logPacket(packet, buffer))
        client.on('packet.outcoming', (packet, buffer) => this.logPacket(packet, buffer))
        client.setMaxListeners(0)
        client.open()
    }

    logPacket(packet, buffer) {
        if (this.settings.logNet)
            log('net', this.self.uid, packet, JSON.stringify(buffer))
    }

    handleClose() {
        log('net', this.self.uid, 'Сервер закрыл соединение')
        if(this.settings.reconnect) {
            log('net', this.self.uid, 'Переподключаемся')
            this.rooms = []
            this.inRoom = false
            this.openConnection()
        }
    }

    async handleConnect(client) {
        client.sendData('HELLO')
        let login = {data: {status: 2}}
        while (login.data.status === 2) {
            login = await executeAndWait(
                client,
                () => client.sendData('LOGIN', ...composeLogin(this.settings.session)),
                'packet.incoming',
                'PacketLogin',
                1000)
        }
        this.self.uid = login.data.innerId
        log('net', this.self.uid, 'статус логина:' + login.data.status)
        if (login.data.status !== 0) {
            new Error('Invalid session')
            return
        }
        // sq-lib/shared/PlayerInfoData.js Список полей для получения информации об игроке, объединяются через логическое ИЛИ
        try{
            this.self = (await executeAndWait(
                    client,
                    () => client.sendData('REQUEST', [[this.self.uid]], 148744),
                    'packet.incoming',
                    packet => packet.type === 'PacketInfo' && packet.data.data[0].uid === this.self.uid,
                    2000)
            ).data.data[0]
        }catch (e) {
            console.log(e)
            client.close()
        }
        client.sendData('AB_GUI_ACTION', 0)
        this.getSurrender().then(canSurrender => {
            if (this.settings.surrender) this.settings.surrender = canSurrender
            if (!canSurrender) log('net', this.self.uid, 'Капитуляция не прокачана')
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
        const online = (await executeAndWait(
            client,
            () => client.sendData('REQUEST', ids, 64),
            'packet.incoming',
            'PacketInfo',
            1000)).data.data
        const isOnline = online.filter(id => id.online === 1).length > 0
        if (!isOnline && this.moderatorsOnline && !this.inRoom) {
            log('net', this.self.uid, 'Модератор вышел из сети, заходим в комнату')
            this.startRound(client)
        }
        if (this.settings.surrender && isOnline && this.inRoom) {
            log('net', this.self.uid, 'Модератор вошел в сеть, прекращаем капитуляцию и выходим из комнаты')
            this.settings.surrender = false
            client.sendData('LEAVE')
        }
        this.moderatorsOnline = isOnline
    }

    donateAndLeave(client) {
        if(this.settings.donateLevel && this.self.clan_id && this.self.level >= this.settings.donateLevel) {
            log('net', this.self.uid, 'Получен лвл ' + this.self.level + ', вкладываем в клан все ресурсы и выходим')
            client.sendData('CLAN_DONATION', this.coins ,this.nuts)
            client.sendData('CLAN_LEAVE')
            if(this.settings.clanIdToJoin)
                this.settings.clanIdToJoin = null
        }
    }

    handlePacket(client, packet, buffer) {
        switch (packet.type) {
            case 'PacketClanInfo':
                if (packet.data.data[0].id === this.settings.clanIdToJoin)
                    this.clanLevelLimiter = packet.data.data[0].level_limiter
                break
            case 'PacketClanJoin':
                if (packet.data.playerId === this.self.uid) {
                    log('net', this.self.uid, 'Заявка в клан одобрена')
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
                if (packet.data.items.length > 0) log('net', this.self.uid, 'Получена заявка в клан')
                packet.data.items.forEach(id => global.clients.forEach(player => {
                    if (player.self.uid === id.playerId) {
                        client.sendData('CLAN_ACCEPT', [[id.playerId]], 1)
                        log('net', this.self.uid, 'Принял заявку в клан от ' + id.playerId)
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
                if (this.settings.buyVIP && !this.hasVip && this.coins >= 10) {
                    client.sendData('BUY', 45, 10, 0, this.self.uid, 0)
                    log('net', this.self.uid, 'Закуплен VIP на сутки')
                }
                break
            case "PacketEnergyLimits":
                this.hasVip = packet.data.energy === 300
                this.energyLimit = packet.data.energy
                break
            case 'PacketClanPrivateRooms':
                this.rooms = packet.data.items
                break
            case 'PacketGuard':
                client.sendData('GUARD', [])
                break
            case 'PacketRoom':
                client.sendData('ROUND_ALIVE')
                this.inRoom = true
                this.locationId = packet.data.locationId
                this.isPrivate = packet.data.isPrivate
                this.aliveTimer = setInterval(() => client.sendData('ROUND_ALIVE'), 5000)
                this.room.playerCount = packet.data.players.length + 1
                break
            case 'PacketRoomRound':
                if (packet.data.mapDuration > 0)
                    this.room.mapDuration = packet.data.mapDuration
                client.sendData('AB_GUI_ACTION', 0)
                break
            case 'PacketRoundDie':
                if (packet.data.playerId === this.self.uid)
                    client.sendData('AB_GUI_ACTION', 1)
                break
            case 'PacketRoundHollow':
                if (packet.data.success === 1 && packet.data.playerId === this.self.uid) {
                    log('net', this.self.uid, 'В дупле')
                    client.sendData('AB_GUI_ACTION', 1)
                }
                break
            case 'PacketRoomJoin':
                this.room.playerCount++
                break
            case 'PacketRoomLeave':
                this.room.playerCount--
                if (packet.data.playerId !== this.self.uid) break
                clearInterval(this.aliveTimer)
                this.inRoom = false
                log('net', this.self.uid, 'Выход из комнаты')
                break
            case 'PacketBalance':
                this.nuts = packet.data.nuts
                this.coins = packet.data.coins
                if (this.nuts >= 2147483500) {
                    this.settings.surrender = false
                    log('net', this.self.uid, 'Остановлен автокап во избежание обнуления орехов')
                }
                break
        }
        if (this.settings.autoPlay) this.handleAutoplayPacket(client, packet, buffer)
    }

    handleAutoplayPacket(client, packet) {
        switch (packet.type) {
            case 'PacketRoundHollow':
                if (!this.self.clan_id && this.self.level >= 8 && this.self.level >= this.clanLevelLimiter && !(this.settings.donateLevel && this.self.level >= this.settings.donateLevel))
                    client.sendData('CLAN_JOIN', [this.settings.clanIdToJoin])
                if (this.settings.playInClan && !this.isPrivate && this.self.clan_id && this.rooms.length > 0) {
                    log('net', this.self.uid, 'Найдены непустые комнаты в клане, переходим в них')
                    client.sendData('LEAVE')
                    this.startRound(client)
                }
                if(this.locationId !== this.settings.locationId && !this.isPrivate && this.locationId !== searchMaxLocationIdForLevel(this.self.level)) {
                    log('net', this.self.uid, 'Доступны более высокие локации, переходим в них')
                    client.sendData('LEAVE')
                    this.startRound(client)
                }
                break
            case 'PacketRoomRound':
                if (packet.data.type === 4) {
                    log('net', this.self.uid, 'Начало раунда')
                    setTimeout(() => {
                        this.toHollow(client)
                    }, this.settings.surrender ? (this.room.mapDuration - 10) * 1000 : 4000)
                }
                break
            case 'PacketRoundShaman':
                if (!this.settings.surrender) break
                const shamans = packet.data.playerId
                shamans.map(shaman => {
                    if (shaman === this.self.uid && this.room.playerCount > 1)
                        client.sendData('ROUND_SKILL_SHAMAN', 20, true)
                })
                break
        }
    }

    toHollow(client) {
        log('net', this.self.uid, 'Заход в дупло')
        client.sendData('ROUND_NUT', 0)
        client.sendData('ROUND_HOLLOW', 0)
        client.sendData('AB_GUI_ACTION', 1)
        if (this.settings.checkModerators && this.moderatorsOnline) {
            client.sendData('LEAVE')
            log('net', this.self.uid, 'Модератор в сети, выходим из комнаты')
        }
    }

    async loadRooms(client) {
        if (this.self.clan_id !== 0)
            this.rooms = (await executeAndWait(client, () => client.sendData('CLAN_GET_ROOMS'), 'packet.incoming', 'PacketClanPrivateRooms')).data.items
    }

    async startAutoplay(client) {
        console.log('Запускаем автоплеер')
        if (this.settings.playInClan)
            await this.loadRooms(client)
        this.checkModerators(client)
        setInterval(() => this.checkModerators(client), 10000)
        this.startRound(client)
        setInterval(() => this.startRound(client), 60000)
    }

    getRoomWithMinPlayers(rooms) {
        let minPlayers = 14
        let minRoom = null
        rooms.map(room => {
            if (room.playersCount < minPlayers) {
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
                log('net', this.self.uid, 'Вход за', this.settings.joinId)
                const playWith = await executeAndWait(
                    client,
                    () => client.sendData('PLAY_WITH', this.settings.joinId),
                    'packet.incoming',
                    'PacketPlayWith',
                    200
                )
                if ([0, 1, 2, 3].indexOf(playWith.data.type) !== -1) {
                    log('net', this.self.uid, 'Невозможно присоединиться, статус:' + playWith.data.type + ', повторение через 10 секунд')
                    setTimeout(() => this.startRound(client), 10000)
                    return
                }
            } catch (e) {
                // Зашли
            }
        }
        if (this.settings.playInClan && this.self.clan_id) {
            if (!this.settings.roomId || this.rooms.filter(room => room.roomId === this.settings.roomId).length === 0) {
                log('net', this.self.uid, 'Комната не задана, либо не найдена. Фолбек на locationId.')
                if (this.rooms.length === 0) {
                    log('net', this.self.uid, 'Нет доступных комнат')
                    return
                }
                this.settings.roomId = this.rooms.filter(room => room.locationId === this.settings.locationId)
                if (this.rooms.length !== 0) {
                    this.settings.roomId = this.getRoomWithMinPlayers(this.rooms)
                } else {
                    log('net', this.self.uid, 'Нет доступных комнат заданного типа, выбираем первую доступную с наименьшим числом игроков')
                    this.settings.roomId = this.getRoomWithMinPlayers(this.rooms)
                }
            }
            if(this.settings.roomId){
                client.sendData('PLAY_ROOM', this.settings.roomId)
                log('net', this.self.uid, 'Вход в комнату', this.settings.roomId)
                return
            }
        }
        if (this.settings.locationId > 0 && !this.self.clan_id && canJoinToLocation(this.settings.locationId, this.self.level)) {
            client.sendData('PLAY', this.settings.locationId, 0)
            log('net', this.self.uid, 'Поиск комнаты')
        } else {
            const id = searchMaxLocationIdForLevel(this.self.level)
            client.sendData('PLAY', id, 0)
            log('net', this.self.uid, 'Заходим в локацию с максимально высоким минимальным уровнем, id:' + id)
        }
    }
}

module.exports = Player