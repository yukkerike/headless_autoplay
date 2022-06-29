module.exports = function(prompt) {
	var stdin = process.stdin, stdout = process.stdout;
	stdin.resume();
	stdout.write(prompt);
	return new Promise(resolve => {
		stdin.once('data', (data) => {
			resolve(data.toString());
		});
	});
}