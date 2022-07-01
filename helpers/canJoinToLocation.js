const {ClientData} = require("sq-lib");

module.exports = function (locationId, level) {
    const locations = ClientData.ConfigData.maps.locations
    return locations[locationId].min_level <= level && locations[locationId].is_gaming
}