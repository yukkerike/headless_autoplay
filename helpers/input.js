module.exports = function() {
	var stdin = process.stdin, stdout = process.stdout;
	stdin.resume();
	stdout.write(">>> ");
	return new Promise(resolve => {
		stdin.once('data', (data) => {
			resolve(data.toString());
		});
	});
}