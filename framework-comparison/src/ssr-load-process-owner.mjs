import { fork } from 'node:child_process';

/** Starts one IPC-owned service or load driver; startup failure reaps the attempted child. */
export async function startSsrLoadProcess(role, { onInterval = () => {} } = {}) {
	const child = fork(new URL('./ssr-load-process.mjs', import.meta.url), [role], {
		execArgv: [],
		stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
		windowsHide: true
	});
	let stderr = '',
		readyResolve,
		readyReject,
		resultResolve,
		resultReject,
		readyTimer;
	child.stderr.on('data', (chunk) => {
		stderr = `${stderr}${chunk}`.slice(-32_000);
	});
	const ready = new Promise((resolve, reject) => {
		readyResolve = resolve;
		readyReject = reject;
	});
	const result = new Promise((resolve, reject) => {
		resultResolve = resolve;
		resultReject = reject;
	});
	// Service owners do not await a driver result; still consume unexpected child failures.
	void result.catch(() => {});
	child.on('message', (message) => {
		if (message.type === 'ready') {
			clearTimeout(readyTimer);
			readyResolve(message);
		} else if (message.type === 'complete') resultResolve(message.result);
		else if (message.type === 'interval') onInterval(message);
	});
	child.once('error', fail);
	child.once('exit', (code, signal) =>
		fail(new Error(`${role} exited (${code ?? signal}): ${stderr}`))
	);
	readyTimer = setTimeout(() => fail(new Error(`${role} startup timed out: ${stderr}`)), 30_000);
	try {
		const address = await ready;
		return {
			child,
			...address,
			result,
			run(plan) {
				child.send({ type: 'run', plan }, (error) => {
					if (error) fail(error);
				});
			},
			close: () => stopSsrLoadProcess(child)
		};
	} catch (error) {
		await stopSsrLoadProcess(child);
		throw error;
	}

	/** Settles both startup and execution failures; settled promises ignore later exit notifications. */
	function fail(error) {
		clearTimeout(readyTimer);
		readyReject(error);
		resultReject(error);
	}
}

/** Disconnects one owned process and escalates only that PID if graceful cleanup fails. */
async function stopSsrLoadProcess(child) {
	if (child.exitCode !== null || child.signalCode !== null) return;
	if (child.connected) child.disconnect();
	if (await waitForExit(child, 3000)) return;
	child.kill('SIGTERM');
	if (await waitForExit(child, 2000)) return;
	child.kill('SIGKILL');
	if (!(await waitForExit(child, 2000)))
		throw new Error(`Unable to stop owned load process ${child.pid}`);
}

/** Removes both listeners and timeout when either exit or deadline wins. */
function waitForExit(child, ms) {
	if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
	return new Promise((resolve) => {
		const timer = setTimeout(() => finish(false), ms);
		const exited = () => finish(true);
		child.once('exit', exited);
		function finish(value) {
			clearTimeout(timer);
			child.off('exit', exited);
			resolve(value);
		}
	});
}
