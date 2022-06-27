const { Logger, GameClient, GameServer, PolicyServer } = require('sq-lib')

const log = Logger.info
Logger.setOptions({logFile: 1, debug: 0, info: 1, warn: 1, error: 1, fatal: 1})

let policyServer = new PolicyServer({
    port: 843,
    host: '0.0.0.0',
    allowedPorts: [ 
        11111,
        11211,
        11311
    ]
})
policyServer.on('server.listening', () => {
    console.log(`Сервер политики работает на ${policyServer.options.host}:${policyServer.options.port}`)
})
policyServer.listen()
let server = new GameServer({
    port: [
        11111, 
        11211, 
        11311
    ],
    host: '0.0.0.0',
    manualOpen: true
})
server.on('server.listening', (server) => console.log(`Сервер работает на ${server.address().address}:${server.address().port}`))
server.on('client.connect', (client) => {
    let proxy = new GameClient({
        'port': 11111,
        'host': '88.212.206.137'
    })
    proxy.on('client.connect', () => client.open())
    proxy.on('client.close', () => client.close())
    proxy.on('client.error', (error) => client.close())
    proxy.on('client.timeout', () => client.close())
    proxy.on('packet.incoming', (packet, buffer) => {
        log('incoming', packet)
        client.sendPacket(packet)
    })
    client.proxy = proxy
    proxy.open()
})
server.on('packet.incoming', async (client, packet) => {
    log('outcoming', packet)
    client.proxy.sendPacket(packet)
})
server.on('client.close', (client) => client.proxy.close())
server.on('client.error', (client, error) => client.proxy.close())
server.on('client.timeout', (client) => client.proxy.close())
server.listen()

const terminate = function() {
    console.log('Завершение работы...')
    process.exit()
}
process.on('SIGINT', terminate);
process.on('SIGTERM', terminate);
