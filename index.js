const {Logger} = require('sq-lib')
const {waitForResult, executeAndWait, composeLogin, input, sleep, createClient} = require('./helpers')

const session = "" // javascript:(function(){var _=prompt('',document.getElementById('flash-app').childNodes[1].value)})()
const host = '88.212.206.137'
const ports = ['11111', '11211', '11311']

const log = Logger.info
Logger.setOptions({logFile: 0, debug: 0, info: 1, warn: 1, error: 1, fatal: 1})

class Player {
    self = null
    room = {
        mapDuration: -1
    }

    constructor(session, settings) {
        this.session = session
        this.settings = settings
        const client = createClient(host, ports)
        this.client = client
        client.on('client.connect', () => this.handleConnect(client))
        client.on('client.close', () => this.handleClose(client))
        client.on('packet.incoming', (packet, buffer) => this.handlePacket(client, packet, buffer))
        client.on('packet.incoming', (packet, buffer) => log('net', packet, JSON.stringify(buffer)))
        client.on('packet.outcoming', (packet, buffer) => log('net', packet, JSON.stringify(buffer)))
        client.open()
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
                this.aliveTimer = setInterval(() => client.sendData('ROUND_ALIVE'), 5000)
            case 'PacketRoomRound':
                this.room.mapDuration = packet.data.mapDuration
                client.sendData('AB_GUI_ACTION', 0)
                break
            case 'PacketRoundDie':
                if (packet.data.playerId === this.self.uid)
                    client.sendData('AB_GUI_ACTION', 1)
                break
            case 'PacketRoundHollow':
                if (packet.data.success === 1 && packet.data.playerId === this.self.uid)
                    client.sendData('AB_GUI_ACTION', 1)
                break
            case 'PacketRoomLeave':
                clearInterval(this.aliveTimer)
                log('net', 'Выход из комнаты')
                break
        }
        // ... use these -> packet.length, packet.type, packet.data
    }

    handleClose() {
        log('net', 'Client closed')
        process.exit(0)
    }

    async handleConnect(client) {
        client.sendData('HELLO')
        let login = {data: {status: 2}}
        while (login.data.status === 2) {
            login = await executeAndWait(client, () => client.sendData('LOGIN', ...composeLogin(this.session)), 'packet.incoming', 'PacketLogin', 1000)
        }
        if (login.data.status === 1 || login.data.status === 3) {
            log('net', 'Логин не удался, статус', login.data.status)
            process.exit(1)
        }
        const selfId = login.data.innerId
        this.self = (await waitForResult(client, 'packet.incoming',
            packet => packet.type === 'PacketInfo' && packet.data.data[0].uid === selfId,
            1000)).data.data[0]
        client.sendData('AB_GUI_ACTION', 0)
        this.handleAutoplay(client)
        await sleep(100)
        while (1) {
            let expression = await input()
            console.log(eval(expression))
        }
    }

    async handleAutoplay(client) {
        if (this.self.clanId !== 0) {
            this.rooms = (await executeAndWait(client, () => client.sendData('CLAN_GET_ROOMS'), 'packet.incoming', 'PacketClanPrivateRooms', 1000)).data.items
        }
        this.startRound(client)

    }

    handleAutoplayPacket(client, packet, buffer) {
        switch (packet.type) {
            case 'PacketRoomRound':
                if (packet.data.type === 4) {
                    log('net', 'Начало раунда')
                    setTimeout(() => {
                        client.sendData('ROUND_NUT', 0)
                        client.sendData('ROUND_HOLLOW', 0)
                        client.sendData('AB_GUI_ACTION', 1)
                    }, 4100)
                }
                break
        }
    }

    async startRound(client) {
        client.on('packet.incoming', (packet, buffer) => this.handleAutoplayPacket(client, packet, buffer))
        client.sendData('PLAY_ROOM', this.rooms[0].roomId)
        await waitForResult(client, 'packet.incoming', 'PacketRoom')
        log('net', 'Вход в комнату', this.rooms[0].roomId)
        await waitForResult(client, 'packet.incoming', 'PacketRoundHollow',)
        client.sendData('LEAVE')
    }
}

const player = new Player(session, {})