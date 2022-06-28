module.exports = function (event, type, client, timeout = 0) {
    const onPacket = (resolve, packet, buffer) => {
        if (typeof(type) === 'function' && type(packet) || packet.type === type) {
            client.off(event, onPacket)
            resolve(packet, buffer)
        }
    }
    return new Promise(
        (resolve, reject) => {
            client.on(event, onPacket.bind(this, resolve))
            if (timeout > 0) {
                setTimeout(() => {
                    client.off(event, onPacket)
                    reject(new Error('Timeout'))
                }, timeout)
            }
        }
    )
}