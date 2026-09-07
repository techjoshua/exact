import { readFile, writeFile } from 'node:fs/promises';
import { installDevelopmentProcessLifecycle } from '../../scripts/development-process-lifecycle.mjs';
import { startComparisonServer } from './server.mjs';
import { runSsrLoadPlan } from './ssr-load-driver.mjs';
import { createLoadProcessMeter } from './ssr-load-statistics.mjs';

const role = process.argv[2],
	abort = new AbortController();
let service, meter, timer;
const lifecycle = installDevelopmentProcessLifecycle({ label: `SSR load ${role}`, close });
process.once('disconnect', () => void lifecycle.shutdown('owner-disconnected'));

/** Cancels pending HTTP work and closes the exact service resources owned by this child. */
async function close() {
	abort.abort();
	clearInterval(timer);
	meter?.close();
	if (service) {
		const owned = service;
		service = undefined;
		await owned.close();
	}
}

/** Sends bounded interval messages; IPC failure cancels load instead of orphaning it. */
function send(message) {
	if (process.send && process.connected)
		process.send(message, (error) => {
			if (error) abort.abort(error);
		});
}

try {
	if (role === 'service') {
		service = await startComparisonServer({ port: 0 });
		meter = createLoadProcessMeter();
		timer = setInterval(
			() => send({ type: 'interval', epochMs: Date.now(), ...meter.sample() }),
			1000
		);
		send({ type: 'ready', url: service.url, pid: process.pid });
	} else if (role === 'driver') {
		let plan;
		if (process.argv[3]) plan = JSON.parse(await readFile(process.argv[3], 'utf8'));
		else {
			send({ type: 'ready', pid: process.pid });
			plan = await new Promise((resolve, reject) => {
				process.once('message', (message) =>
					message.type === 'run' ? resolve(message.plan) : reject(new Error('Expected load plan'))
				);
				abort.signal.addEventListener('abort', () => reject(abort.signal.reason), { once: true });
			});
		}
		const result = await runSsrLoadPlan(plan, {
			signal: abort.signal,
			onInterval: (row) => send({ type: 'interval', ...row })
		});
		if (process.argv[4]) await writeFile(process.argv[4], JSON.stringify(result, null, 2) + '\n');
		if (process.send && process.connected)
			await new Promise((resolve, reject) =>
				process.send({ type: 'complete', result }, (error) => (error ? reject(error) : resolve()))
			);
		else if (!process.argv[4]) console.log(JSON.stringify(result));
		await close();
		lifecycle.dispose();
		process.removeAllListeners('disconnect');
		if (process.connected) process.disconnect();
	} else throw new Error('Expected service or driver role');
} catch (error) {
	console.error(error.stack ?? error);
	await close();
	lifecycle.dispose();
	process.removeAllListeners('disconnect');
	if (process.connected) process.disconnect();
	process.exitCode = 1;
}
