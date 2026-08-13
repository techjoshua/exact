import { spawn } from 'node:child_process';
import path from 'node:path';

/** Starts both native-full-stack production listeners and returns an idempotent teardown. */
export async function startNativeHarness() {
	const suiteRoot = path.resolve(import.meta.dirname, '..');
	const children = [
		spawn(process.execPath, ['participants/exact-native/dist/server/start.js'], {
			cwd: suiteRoot,
			env: { ...process.env, PORT: '4501' },
			stdio: 'ignore',
			windowsHide: true
		}),
		spawn(
			process.execPath,
			[path.resolve(suiteRoot, 'node_modules/@react-router/serve/bin.js'), 'build/server/index.js'],
			{
				cwd: path.resolve(suiteRoot, 'participants/react-native'),
				env: { ...process.env, HOST: '127.0.0.1', PORT: '4502' },
				stdio: 'ignore',
				windowsHide: true
			}
		)
	];
	await Promise.all([
		waitUntilReady('http://127.0.0.1:4501/'),
		waitUntilReady('http://127.0.0.1:4502/')
	]);
	let closed = false;
	return {
		async close() {
			if (closed) return;
			closed = true;
			for (const child of children) child.kill();
			await Promise.all(
				children.map(
					(child) =>
						new Promise((resolve) => {
							if (child.exitCode !== null) resolve();
							else child.once('exit', resolve);
						})
				)
			);
		}
	};
}

async function waitUntilReady(url) {
	for (let attempt = 0; attempt < 60; attempt += 1) {
		try {
			if ((await fetch(url)).ok) return;
		} catch {
			// The production listener is still starting.
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`Native participant did not become ready: ${url}`);
}
