import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

/** Starts a prebuilt Rust driver. Its stdin is an ownership pipe, so parent exit cancels HTTP work. */
export async function startRustLoadProcess({ onInterval = () => {} } = {}) {
	const binary =
		process.env.COMPARISON_RUST_DRIVER ??
		fileURLToPath(
			new URL(
				`../../.tmp/rust-load-driver-target/release/exact-ssr-load-driver${process.platform === 'win32' ? '.exe' : ''}`,
				import.meta.url
			)
		);
	const binarySha256 = createHash('sha256')
		.update(await readFile(binary))
		.digest('hex');
	const child = spawn(binary, [], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
	const lines = createInterface({ input: child.stdout });
	let stderr = '',
		readyResolve,
		readyReject,
		resultResolve,
		resultReject;
	const ready = new Promise((resolve, reject) => {
		readyResolve = resolve;
		readyReject = reject;
	});
	const result = new Promise((resolve, reject) => {
		resultResolve = resolve;
		resultReject = reject;
	});
	void result.catch(() => {});
	const timer = setTimeout(() => fail(new Error('Rust driver startup timed out')), 30_000);
	child.stderr.on('data', (chunk) => {
		stderr = `${stderr}${chunk}`.slice(-32_000);
	});
	child.stdin.on('error', fail);
	child.once('error', fail);
	child.once('close', (code, signal) => {
		lines.close();
		fail(new Error(`Rust driver exited (${code ?? signal}): ${stderr}`));
	});
	lines.on('line', (line) => {
		try {
			const message = JSON.parse(line);
			if (message.type === 'ready') {
				clearTimeout(timer);
				readyResolve(message);
			} else if (message.type === 'interval') onInterval({ type: 'interval', ...message.row });
			else if (message.type === 'complete') {
				message.result.driver.binarySha256 = binarySha256;
				resultResolve(message.result);
			} else throw new Error('Unknown Rust driver message');
		} catch (error) {
			fail(error);
			child.stdin.end();
		}
	});
	try {
		const address = await ready;
		return {
			child,
			...address,
			result,
			run(plan) {
				child.stdin.write(JSON.stringify({ type: 'run', plan }) + '\n', (error) => {
					if (error) fail(error);
				});
			},
			close: () => closeRustDriver(child)
		};
	} catch (error) {
		await closeRustDriver(child);
		throw error;
	}

	/** Startup and result failures settle once. Exit after successful completion preserves the result. */
	function fail(error) {
		clearTimeout(timer);
		readyReject(error);
		resultReject(error);
	}
}

/** Closes only the owned child, escalating if stdin EOF does not promptly finish cancellation. */
async function closeRustDriver(child) {
	if (child.exitCode !== null || child.signalCode !== null) return;
	child.stdin.end();
	if (await exited(child, 3000)) return;
	child.kill('SIGTERM');
	if (await exited(child, 2000)) return;
	child.kill('SIGKILL');
	if (!(await exited(child, 2000))) throw new Error(`Unable to stop Rust driver ${child.pid}`);
}

/** Removes both timeout and listener when the owned child exits or the deadline expires. */
function exited(child, milliseconds) {
	if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
	return new Promise((resolve) => {
		const timer = setTimeout(() => finish(false), milliseconds);
		const onExit = () => finish(true);
		child.once('exit', onExit);
		function finish(value) {
			clearTimeout(timer);
			child.off('exit', onExit);
			resolve(value);
		}
	});
}
