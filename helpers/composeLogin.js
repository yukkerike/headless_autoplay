function queryStringToObject(queryString) {
	let result = {}
	queryString.split('&').forEach(item => {
		let [key, value] = item.split('=')
		result[key] = value
	})
	return result
}

function composeLogin(token) {
	const session = queryStringToObject(token)
	let id, netType, OAuth, key, tag, ref, result = []
	id = BigInt(session.userId)
	netType = parseInt(session.net_type)
	OAuth = session.OAuth ? 1 : 0
	switch (session.useApiType) {
		case 'sa':
			key = session.authKey
			ref = -1
			break
		case 'ok':
			key = session.auth_sig
			ref = 20000
			break
		case 'vk':
			key = ""
			ref = 0
			break
		case 'mm':
			key = ""
			ref = 10000
	}
	result = [id, netType, OAuth, key, 3, ref]
	if (session.useApiType !== 'sa')
		result.push(session.token)
	return result
}

module.exports = composeLogin