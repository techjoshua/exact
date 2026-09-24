import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import { BunResolutionWorker } from './resolution-worker.js';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn }));
afterEach(() => vi.useRealTimers());

function workerFixture() {
	vi.useFakeTimers();
	const child = Object.assign(new EventEmitter(), {
		stdin: new PassThrough(),
		stdout: new PassThrough(),
		stderr: new PassThrough(),
		exitCode: null as number | null,
		kill: vi.fn(() => {
			child.exitCode = 1;
			child.emit('close');
			return true;
		})
	});
	spawn.mockReturnValue(child);
	const worker = new BunResolutionWorker();
	return {
		worker,
		child,
		reply: (id: number) => child.stdout.write(`${JSON.stringify({ id, path: '/provider.js' })}\n`)
	};
}

it('gives each serial resolution its own execution timeout after queued work finishes', async () => {
	const { worker, reply } = workerFixture();
	try {
		const first = worker.resolve({ request: 'first' });
		const second = worker.resolve({ request: 'second' });
		const results = Promise.allSettled([first, second]);
		await vi.advanceTimersByTimeAsync(20_000);
		reply(1);
		await first;
		await vi.advanceTimersByTimeAsync(20_000);
		reply(2);
		expect((await results).map((result) => result.status)).toEqual(['fulfilled', 'fulfilled']);
	} finally {
		await worker.dispose();
	}
});

it('rejects active and queued work and releases the process when the active lookup times out', async () => {
	const { worker, child } = workerFixture();
	try {
		const results = Promise.allSettled([worker.resolve({}), worker.resolve({})]);
		await vi.advanceTimersByTimeAsync(30_000);
		expect((await results).map((result) => result.status)).toEqual(['rejected', 'rejected']);
		expect(child.kill).toHaveBeenCalledOnce();
		await expect(worker.resolve({})).rejects.toThrow('disposed');
	} finally {
		await worker.dispose();
	}
});
