const waitForResult = require('./waitForResult')

module.exports = function (func, event, type, client, timeout = 0) {
    const promise = waitForResult(event, type, client, timeout)
    func()
    return promise
}