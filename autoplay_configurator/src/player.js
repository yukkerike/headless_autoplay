import jsYaml from "js-yaml";

let oldConfig = localStorage.getItem('config')
console.log(oldConfig)
if (oldConfig === null) {
    var config = {
        host: '88.212.206.137',
        ports: ['11111', '11211', '11311'],
        logNet: false,
        repl: true,
        defaults:
            {
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
                clanIdToJoin: null,
                buyVIP: false,
                donateLevel: null
            },
        players: []
    }
} else {
    var config = JSON.parse(oldConfig)
}

const addNewPlayer = () => {
    config.players.push({...config.defaults, session: 'ВАША СЕССИЯ'})
}

const removePlayer = (index) => {
    config.players.splice(index, 1)
}

const getConfig = () => {
    localStorage.setItem('config', JSON.stringify(config))
    return jsYaml.dump(config)
}

export {addNewPlayer, removePlayer, getConfig, config}