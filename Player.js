const {Logger} = require('sq-lib')
const {waitForResult, executeAndWait, composeLogin, input, sleep, createClient} = require('./helpers')

const log = Logger.info
Logger.setOptions({logFile: 0, debug: 0, info: 1, warn: 1, error: 1, fatal: 1})

class Player {
    self = null
    inRoom = false
    moderatorsOnline = false
    rooms = []

    room = {
        mapDuration: 0,
        playerCount: 0
    }

    settings = {
        session: "",
        log: false,
        checkModerators: true,
        autoPlay: true,
        playInClan: true,
        locationId: 4,
        surrender: false,
        roomId: null,
        joinId: null,
        repl: false
    }

    constructor(host, ports, settings = {}) {
        this.settings = {...this.settings, ...settings}
        const client = createClient(host, ports)
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
        if (this.settings.log)
            log('net', this.self.uid, packet, JSON.stringify(buffer))
    }

    handleClose() {
        log('net', this.self.uid, 'Сервер закрыл соединение')
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
        if (login.data.status) {
            new Error('Invalid session')
        }
        const selfId = login.data.innerId
        this.self = (await executeAndWait(
                client,
                () => client.sendData('REQUEST', [[selfId]], 4194303),
                'packet.incoming',
                packet => packet.type === 'PacketInfo' && packet.data.data[0].uid === selfId,
                2000)
        ).data.data[0]
        client.sendData('AB_GUI_ACTION', 0)
        this.getSurrender().then(canSurrender => {
            if (this.settings.surrender) this.settings.surrender = canSurrender
            if (!canSurrender) log('net', this.self.uid, 'Капитуляция не прокачана')
        })
        if (this.settings.autoPlay)
            this.startAutoplay(client)
        await sleep(100)
        if (this.settings.repl) {
            while (1) {
                let expression = await input('autoplay_repl >>> ')
                try {
                    console.log(eval(expression))
                } catch (e) {
                    console.log(e)
                }
            }
        }
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

    handlePacket(client, packet, buffer) {
        switch (packet.type) {
            case 'PacketEnergy':
                this.energy = packet.data.energy
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
                this.aliveTimer = setInterval(() => client.sendData('ROUND_ALIVE'), 5000)
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
            case 'PacketRoomLeave':
                clearInterval(this.aliveTimer)
                this.inRoom = false
                log('net', this.self.uid, 'Выход из комнаты')
                break
            case 'PacketBalance':
                if (packet.data.nuts >= 2147483500) {
                    this.settings.surrender = false
                    log('net', this.self.uid, 'Остановлен автокап во избежание обнуления орехов')
                }
                break
        }
        if (this.settings.autoPlay) this.handleAutoplayPacket(client, packet, buffer)
    }

    async loadRooms(client) {
        if (this.self.clanId !== 0)
            this.rooms = (await executeAndWait(client, () => client.sendData('CLAN_GET_ROOMS'), 'packet.incoming', 'PacketClanPrivateRooms')).data.items
    }

    async startAutoplay(client) {
        console.log('Запускаем автоплеер')
        if (this.settings.playInClan)
            await this.loadRooms(client)
        this.checkModerators(client)
        setInterval(() => this.checkModerators(client), 10000)
        this.startRound(client)
        setInterval(() => this.startRound(client), 62000)
    }

    handleAutoplayPacket(client, packet) {
        switch (packet.type) {
            case 'PacketRoomRound':
                if (packet.data.type === 4) {
                    log('net', this.self.uid, 'Начало раунда')
                    setTimeout(() => {
                        this.toHollow(client)
                    }, this.settings.surrender ? (this.room.mapDuration - 10) * 1000 : 4100)
                }
                break
            case 'PacketRoom':
                this.room.playerCount = packet.data.players.length + 1
                break
            case 'PacketRoomJoin':
                this.room.playerCount++
                break
            case 'PacketRoomLeave':
                this.room.playerCount--
                break
            case 'PacketRoundShaman':
                if (!this.settings.surrender) break
                const shamans = packet.data.playerId
                shamans.map(shaman => {
                    if (shaman === this.self.uid && this.room.playerCount > 2)
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

    async startRound(client) {
        if (this.inRoom) return
        if (this.settings.joinId > 0) {
            const playWith = await executeAndWait(
                client,
                () => client.sendData('PLAY_WITH', this.settings.joinId),
                'packet.incoming',
                'PacketPlayWith',
                200
            )
            if (playWith.data.roomId === -1) {
                log('net', this.self.uid, 'Игрок не в сети, повторение через 10 секунд')
                setTimeout(() => this.startRound(client), 10000)
                return
            }
            log('net', this.self.uid, 'Вход за', this.settings.joinId)
            return
        }
        if (this.settings.playInClan) {
            if (!this.settings.roomId || this.rooms.filter(room => room.roomId === this.settings.roomId).length === 0) {
                log('net', this.self.uid, 'Комната не задана, либо не найдена. Фолбек на preferredLocationId.')
                if (this.rooms.length === 0) {
                    log('net', this.self.uid, 'Нет доступных комнат')
                    return
                }
                this.settings.roomId = this.rooms.filter(room => room.locationId === this.settings.locationId)[0].roomId
            }
            client.sendData('PLAY_ROOM', this.settings.roomId)
            log('net', this.self.uid, 'Вход в комнату', this.settings.roomId)
        } else {
            client.sendData('PLAY', this.settings.locationId, 0)
            log('net', this.self.uid, 'Поиск комнаты')
        }
    }
}

module.exports = Player