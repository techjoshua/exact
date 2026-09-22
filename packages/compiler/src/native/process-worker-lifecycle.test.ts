import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { expect, it } from 'vitest';

// A POSIX executable fixture lets the real worker exercise signal escalation. Windows process
// termination is covered by the same async-owner contract without POSIX signal handlers.
it.skipIf(process.platform === 'win32')(
	'acknowledges synchronous shutdown only after child exit',
	async () => {
		const directory = await mkdtemp(join(tmpdir(), 'exact-worker-lifecycle-'));
		let worker: Worker | undefined;
		let pid: number | undefined;
		try {
			const executable = join(directory, 'native-fixture');
			await writeFile(
				executable,
				`#!${process.execPath}\nprocess.on('SIGTERM', () => {});\nrequire('node:readline').createInterface({input: process.stdin}).on('line', () => process.stdout.write(JSON.stringify({pid: process.pid}) + '\\n'));\nsetInterval(() => {}, 1000);\n`
			);
			await chmod(executable, 0o755);
			const memory = new SharedArrayBuffer(4096);
			const header = new Int32Array(memory, 0, 4);
			const payload = new Uint8Array(memory, 16);
			Atomics.store(header, 0, -1);
			worker = new Worker(new URL('./process-worker.ts', import.meta.url), {
				workerData: { executable, memory }
			});
			const waitFor = (state: number) => {
				const deadline = Date.now() + 5000;
				while (Atomics.load(header, 0) !== state) {
					if (Date.now() >= deadline) throw new Error(`Worker did not reach state ${state}`);
					const current = Atomics.load(header, 0);
					if (current === state) break;
					Atomics.wait(header, 0, current, Math.max(1, deadline - Date.now()));
				}
			};
			waitFor(0);
			payload.set(new TextEncoder().encode('{}'));
			Atomics.store(header, 1, 2);
			Atomics.store(header, 0, 1);
			worker.postMessage('request');
			waitFor(2);
			pid = JSON.parse(new TextDecoder().decode(payload.subarray(0, Atomics.load(header, 2)))).pid;
			worker.postMessage('close');
			waitFor(4);
			expect(() => process.kill(pid!, 0)).toThrow();
		} finally {
			if (pid) {
				try {
					process.kill(pid, 'SIGKILL');
				} catch {}
			}
			await worker?.terminate();
			await rm(directory, { recursive: true, force: true });
		}
	}
);
