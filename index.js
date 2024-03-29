const Player = require('./Player')
const yaml = require('js-yaml')
const fs = require('fs')
const { sleep } = require('./helpers')

if (fs.existsSync('./config.json')) {
    let config = JSON.parse(fs.readFileSync('./config.json', 'utf8'))
    fs.writeFileSync('./config.yml', yaml.dump(config), 'utf8')
    fs.rmSync('./config.json')
}

try {
    var { host, ports, logNet, repl, players, defaults } = yaml.load(fs.readFileSync('./config.yml', 'utf8'))
} catch (error) {
    console.log('Файл конфигурации не найден или поврежден. Создаю новый...')
    wipe_config()
    terminate()
}

function wipe_config() {
    fs.writeFileSync('./config.yml', yaml.dump({
        host: '88.212.206.137',
        ports: ['11111', '11211', '11311'],
        logNet: false,
        repl: true,
        defaults: {
            reconnect: false,
            reconnectForDailyBonus: false,
            checkModerators: true,
            autoPlay: true,
            autoPlayDelay: 4000,
            playInClan: true,
            paranoidMode: false,
            changeRooms: true,
            locationId: 4,
            surrender: false,
            roomId: null,
            joinId: null,
            clanIdToJoin: 0,
            buyVIP: false,
            donateLevel: null
        },
        players: [{ session: 'useApiType=mm&vid=856304777023089879&access_token=13f4d9304f58e6227a6ba4b4b783aec5&app_id=702077&app_secret=2ca22221fe51f8ca73ccd6ae846f9275&authentication_key=&token=53939e5aaf59822c991822495f31dcb4&userId=856304777023089879&net_type=1&OAuth=1&protocol=https:' }]
    }), 'utf8')
}

const clients = players.map((player, index) => {
    if (!player.session) {
        console.log('Cессия не задана для игрока №' + index)
        return
    }
    try {
        return new Player(host, ports, { ...defaults, ...player, logNet })
    } catch (e) {
        if (e.message === 'Invalid session') {
            console.log('Cессия невалидна для игрока №' + index)
        } else {
            console.error(e)
        }
    }
})
global.clients = clients

function dump() {
    clients.forEach(client => {
        client.dump()
        console.log('\n')
    })
}

if (repl)
    (async () => {
        await sleep(200)
        console.log('Список игроков – в массиве clients')
        console.log('Введите dump() для вывода информации об игроках, либо clients[индекс].dump() для вывода информации о конкретном игроке.')
        const repl = require('repl').REPLServer()
        Object.assign(repl.context, { ...require('./helpers'), clients, yaml, fs, dump })
        repl.on('exit', terminate)
    })()

function terminate() {
    console.log('Завершение работы...')
    try {
        clients.forEach(client => client.client.close())
    } catch (e) {
        console.error(e)
    }
    process.exit()
}

process.on('uncaughtException', e => {
    if (e instanceof TypeError) {
        console.log("Токен должен быть в формате\nuseApiType=mm&vid=856304777023089879&access_token=13f4d9304f58e6227a6ba4b4b783aec5&app_id=702077&app_secret=2ca22221fe51f8ca73ccd6ae846f9275&authentication_key=&token=53939e5aaf59822c991822495f31dcb4&userId=856304777023089879&net_type=1&OAuth=1&protocol=https:", e)
        wipe_config()
    } else {
        console.error('Произошла ошибка', e)
    }
    terminate()
})
process.on('SIGINT', terminate)
process.on('SIGTERM', terminate)