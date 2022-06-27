module.exports = function (type, client, timeout = 0) {
    const onPacket = (resolve, packet, buffer) => {
        if (packet.type === type) {
            client.off('packet.incoming', onPacket)
            resolve(packet, buffer)
        }
    }
    return new Promise(
        (resolve, reject) => {
            client.on('packet.incoming', onPacket.bind(this, resolve))
            if (timeout > 0) {
                setTimeout(() => {
                    client.off('packet.incoming', onPacket)
                    reject(new Error('Timeout'))
                }, timeout)
            }
        }
    )
}