import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Clones and checks out the TypeScript-Go revision pinned by this repository.
 *
 * The destination must not contain an existing checkout. Callers own deciding
 * whether an existing checkout should be reused.
 */
export async function checkoutNativeTypeScriptGo(destination) {
	const resolvedDestination = path.resolve(destination);
	const upstream = JSON.parse(
		await readFile(path.join(repositoryRoot, 'native', 'typescript-go', 'upstream.json'), 'utf8')
	);
	await mkdir(path.dirname(resolvedDestination), { recursive: true });
	await run('git', ['clone', '--filter=blob:none', upstream.repository, resolvedDestination]);
	await run('git', ['-C', resolvedDestination, 'checkout', upstream.revision]);
}

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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	if (!process.argv[2]) {
		throw new Error(
			'Usage: node scripts/checkout-native-typescript-go.mjs <destination directory>'
		);
	}
	await checkoutNativeTypeScriptGo(process.argv[2]);
}
