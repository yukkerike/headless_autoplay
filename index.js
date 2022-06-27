const { Logger, GameClient, ClientData } = require('sq-lib')
const { PacketClient, PacketServer } = ClientData

function handlePacket(client, packet, buffer) {
	Logger.debug('net', 'GameServer.onServerPacket', packet)
	// ... use these -> packet.length, packet.type, packet.data
}

function handleConnect(client) {
	// ..
}

function handleClose(client) {
	// ...
}

function createClient(host, ports) {
	let client = new GameClient({
		port: ports[Math.floor(Math.random() * ports.length)],
		host: host
	})
	client.on('client.connect', () => handleConnect(client))
	client.on('client.close', () => handleClose(client))
	client.on('packet.incoming', (...args) => handlePacket(client, ...args))
	return client
}

const client = createClient('88.212.206.137', ['11111', '11211', '11311'])
const waitFor = new require('./helpers/waitFor')

async function test(){
    let result = await waitFor('test', client, 1000)
    console.log(result)
}
// test()
client.open()