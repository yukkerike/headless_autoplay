const Player = require('./Player')
const fs = require("fs")

const {host, ports, logNet, players} = JSON.parse(fs.readFileSync('./config.json', 'utf8'))
const repl = players.length === 1

let clients = players.map((player, index) => {
    if (!player.session) {
        console.log('Cессия не задана для игрока №' + index)
        return
    }
    try {
        return new Player(host, ports, {...player, log: logNet, repl})
    } catch (e) {
        if (e.message === 'Invalid session') {
            console.log('Cессия невалидна для игрока №' + index)
        }
    }
})

function terminate() {
    console.log('Завершение работы...')
    try{
        clients.forEach(client => client.client.close())
    }catch (e) {
        console.error(e)
    }
    process.exit()
}

process.on('uncaughtException', e => {
    if(e instanceof TypeError) {
        console.log("Токен должен быть в формате\nuseApiType=mm&vid=856304777023089879&access_token=13f4d9304f58e6227a6ba4b4b783aec5&app_id=702077&app_secret=2ca22221fe51f8ca73ccd6ae846f9275&authentication_key=&token=53939e5aaf59822c991822495f31dcb4&userId=856304777023089879&net_type=1&OAuth=1&protocol=https:\nПолучить можно букмарклетом javascript:(function(){var _=prompt('',document.getElementById('flash-app').childNodes[1].value)})()")
    }else{
        console.error('Произошла ошибка', e)
    }
    terminate()
})
process.on('SIGINT', terminate)
process.on('SIGTERM', terminate)