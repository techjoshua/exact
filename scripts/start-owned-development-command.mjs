import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { installDevelopmentProcessLifecycle } from './development-process-lifecycle.mjs';

/** Parses one supervised development command after the `--` ownership boundary. */
export function parseOwnedCommandArguments(arguments_, launchDirectory = process.cwd()) {
	const separator = arguments_.indexOf('--');
	if (separator < 0 || separator === arguments_.length - 1)
		throw new Error('An owned development command requires `-- command [arguments]`');
	let label = 'development command';
	let cwd = path.resolve(launchDirectory);
	for (let index = 0; index < separator; index++) {
		const argument = arguments_[index];
		const value = arguments_[++index];
		if (!value) throw new Error(`${argument} requires a value`);
		if (argument === '--label') label = value;
		else if (argument === '--cwd') cwd = path.resolve(launchDirectory, value);
		else throw new Error(`Unsupported owned command option ${JSON.stringify(argument)}`);
	}
	return Object.freeze({
		label,
		cwd,
		command: arguments_[separator + 1],
		arguments: arguments_.slice(separator + 2)
	});
}

/** Runs a non-Vite development server under parent-loss and process-tree ownership. */
export async function startOwnedDevelopmentCommand(options) {
	const command = options.command === 'node' ? process.execPath : options.command;
	const child = spawn(command, options.arguments, {
		cwd: options.cwd,
		stdio: 'inherit',
		windowsHide: true
	});
	const completion = new Promise((resolve, reject) => {
		child.once('error', reject);
		child.once('exit', (code, signal) => resolve({ code, signal }));
	});
	const lifecycle = installDevelopmentProcessLifecycle({
		label: options.label,
		close: (reason) => closeOwnedChild(child, completion, reason)
	});
	const result = await completion;
	lifecycle.dispose();
	process.exitCode = result.code ?? (result.signal ? 1 : 0);
}

async function closeOwnedChild(child, completion, reason) {
	if (child.exitCode !== null || child.signalCode !== null) return;
	if (reason !== 'parent-exited') {
		const settled = await Promise.race([
			completion.then(() => true),
			new Promise((resolve) => setTimeout(() => resolve(false), 750))
		]);
		if (settled) return;
	}
	if (process.platform === 'win32') {
		await runTaskkill(child.pid);
		return;
	}
	child.kill('SIGTERM');
	const settled = await Promise.race([
		completion.then(() => true),
		new Promise((resolve) => setTimeout(() => resolve(false), 2_000))
	]);
	if (!settled) child.kill('SIGKILL');
}

/** Forcefully removes the exact Windows child tree after graceful settlement was unavailable. */
function runTaskkill(processId) {
	return new Promise((resolve, reject) => {
		const killer = spawn('taskkill.exe', ['/pid', String(processId), '/t', '/f'], {
			stdio: 'ignore',
			windowsHide: true
		});
		killer.once('error', reject);
		killer.once('exit', (code) =>
			code === 0 || code === 128 ? resolve() : reject(new Error(`taskkill exited ${code}`))
		);
	});
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
	await startOwnedDevelopmentCommand(parseOwnedCommandArguments(process.argv.slice(2)));
}
