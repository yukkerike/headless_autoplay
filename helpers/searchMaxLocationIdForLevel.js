const locations = [{
    "id": 0,
    "min_level": 0
},{
    "id": 2,
    "min_level": 12
},{
    "id": 9,
    "min_level": 20
},{
    "id": 3,
    "min_level": 25
},{
    "id": 4,
    "min_level": 32
}]

module.exports = function (level) {
    for (let i = 0; i < locations.length; i++) {
        if (locations[i].min_level > level)
            return locations[i-1].id
    }
    return locations[locations.length-1].id
}