import jsYaml from "js-yaml";

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

const addNewPlayer = () => {
    config.players.push({...config.defaults, session: 'ВАША СЕССИЯ'})
}

const removePlayer = (index) => {
    config.players.splice(index, 1)
}

const getConfig = () => {
    return jsYaml.dump(config)
}

export {addNewPlayer, removePlayer, getConfig, config}