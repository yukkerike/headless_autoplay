const { Logger, GameClient, ClientData, PacketClient } = require('sq-lib')
const { waitForResult, composeLogin, input, sleep } = require('./helpers')
const { executeAndWait } = require("./helpers");

const session = "" // javascript:(function(){var _=prompt('',document.getElementById('flash-app').childNodes[1].value)})()

const log = Logger.info
Logger.setOptions({ logFile: 0, debug: 0, info: 1, warn: 1, error: 1, fatal: 1 })

function handlePacket(client, packet, buffer) {
	log('net', 'ServerPacket', packet, JSON.stringify(buffer))
	// ... use these -> packet.length, packet.type, packet.data
}

async function handleConnect(client) {
	console.log(waitForResult)
	await executeAndWait(() => client.sendData('HELLO'), 'packet.incoming', 'PacketGuard', client, 1000)
	client.sendData('GUARD', [])
	client.sendData('LOGIN', ...composeLogin(session))
	await waitForResult('packet.incoming', 'PacketLogin', client, 1000)
	client.sendData('AB_GUI_ACTION', 0)
	await sleep(100)
	while(1){
		let expression = await input()
		console.log(eval(expression))
	}
}

function handleClose(client) {
	console.log('closed')
}

function createClient(host, ports) {
	let client = new GameClient({
		port: ports[Math.floor(Math.random() * ports.length)],
		host: host
	})
	client.on('client.connect', () => handleConnect(client))
	client.on('client.close', () => handleClose(client))
	client.on('packet.incoming', (...args) => handlePacket(client, ...args))
	client.on('packet.outcoming', (packet, buffer) => log('net', 'ClientPacket', packet, JSON.stringify(buffer)))
	return client
}

const client = createClient('88.212.206.137', ['11111', '11211', '11311'])
client.open()
