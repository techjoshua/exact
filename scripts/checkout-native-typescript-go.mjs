import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const destination = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) {
	throw new Error('Usage: node scripts/checkout-native-typescript-go.mjs <destination directory>');
}
const upstream = JSON.parse(
	await readFile(path.resolve('native', 'typescript-go', 'upstream.json'), 'utf8')
);

await run('git', [
	'clone',
	'--filter=blob:none',
	'https://github.com/microsoft/typescript-go.git',
	destination
]);
await run('git', ['-C', destination, 'checkout', upstream.revision]);

function run(command, arguments_) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, arguments_, {
			stdio: 'inherit',
			windowsHide: true
		});
		child.on('error', reject);
		child.on('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${command} exited with ${code}`));
		});
	});
}
