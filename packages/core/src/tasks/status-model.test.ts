import { expect, it } from 'vitest';
import { flushSync } from '@exactjs/reactive';
import type { TaskContext } from './contracts.js';
import { createTaskOwner } from './owners.js';
import { bindTask, defineTask, taskStatus } from './runtime.js';

type Entry = {
	id: number;
	owner: number;
	key: string;
	pending: boolean;
	started: boolean;
	cleaned: number;
	disposed: number;
	signal?: AbortSignal;
	resolve(value: number): void;
	reject(error: Error): void;
	outcome: Promise<unknown>;
};

/** A reproducible operation stream; assertion context includes its seed and full prefix. */
function randomFrom(seed: number) {
	let value = seed;
	return (limit: number) => {
		value ^= value << 13;
		value ^= value >>> 17;
		value ^= value << 5;
		return (value >>> 0) % limit;
	};
}

/** Flushes task selection and publication without advancing wall-clock timers. */
async function settleSelection() {
	for (let turn = 0; turn < 30; turn++) {
		flushSync();
		await Promise.resolve();
	}
}

for (const concurrency of ['parallel', 'latest', 'queue'] as const) {
	for (const policy of [
		{ readiness: 'blocking', priority: 'normal' },
		{ readiness: 'nonblocking', priority: 'normal' },
		{ readiness: 'nonblocking', priority: 'deferred' }
	] as const) {
		it.each(process.env.EXACT_EXTENDED_TESTING === '1' ? [17, 391, 7201, 8803] : [17, 391])(
			`${concurrency}/${policy.readiness}/${policy.priority} follows the status model (seed %i)`,
			async (seed) => {
				const random = randomFrom(seed);
				const owners = [createTaskOwner(), createTaskOwner()];
				const disposed = [false, false];
				const entries: Entry[] = [];
				const history: string[] = [];
				const task = defineTask(
					{ ...policy, concurrency, concurrencyKey: (key: string, _id: number) => key },
					(_key: string, id: number, context: TaskContext) => {
						const entry = entries[id]!;
						entry.started = true;
						context.cleanup(() => {
							entry.cleaned++;
						});
						context.own({
							[Symbol.dispose]() {
								entry.disposed++;
							}
						});
						entry.signal = context.signal;
						return new Promise<number>((resolve, reject) => {
							entry.resolve = resolve;
							entry.reject = reject;
						});
					}
				);
				const bound = owners.map((owner) => bindTask(task, { owner }));
				const statuses = owners.map((owner) => ({
					all: taskStatus(task, { owner }),
					a: taskStatus(task, { owner, key: 'a' }),
					b: taskStatus(task, { owner, key: 'b' })
				}));
				const cancel = async (owner: number, key?: string) => {
					history.push(`cancel:${owner}/${key ?? 'all'}`);
					const cancelled = entries.filter(
						(entry) => entry.pending && entry.owner === owner && (!key || entry.key === key)
					);
					for (const entry of cancelled) entry.pending = false;
					statuses[owner]![key === 'a' ? 'a' : key === 'b' ? 'b' : 'all'].cancel();
					for (const entry of cancelled) {
						expect(await entry.outcome).toMatchObject({ name: 'AbortError' });
						if (entry.started) {
							expect(entry.signal?.aborted).toBe(true);
							entry.resolve(-1);
						}
					}
				};
				const start = async (owner: number, key: string) => {
					const superseded =
						concurrency === 'latest'
							? entries.filter(
									(entry) => entry.pending && entry.owner === owner && entry.key === key
								)
							: [];
					for (const entry of superseded) entry.pending = false;
					const id = entries.length;
					history.push(`start:${owner}/${key}#${id}`);
					const entry: Entry = {
						id,
						owner,
						key,
						pending: true,
						started: false,
						cleaned: 0,
						disposed: 0,
						resolve() {},
						reject() {},
						outcome: Promise.resolve()
					};
					entries.push(entry);
					entry.outcome = Promise.resolve(bound[owner]!(key, id)).then(
						(value) => value,
						(error: unknown) => error
					);
					for (const previous of superseded)
						expect(await previous.outcome).toMatchObject({ name: 'AbortError' });
				};
				try {
					// Guarantee overlapping owners and keys before exploring generated transitions.
					for (const owner of [0, 1]) for (const key of ['a', 'b']) await start(owner, key);
					for (
						let step = 0;
						step < (process.env.EXACT_EXTENDED_TESTING === '1' ? 160 : 48);
						step++
					) {
						await settleSelection();
						const owner = disposed[1] ? 0 : random(2);
						const key = random(2) ? 'a' : 'b';
						const operation = random(5);
						history.push(`${step}:${operation}/${owner}/${key}`);
						if (step === 30) {
							for (const entry of entries) if (entry.owner === 1) entry.pending = false;
							disposed[1] = true;
							await owners[1]![Symbol.asyncDispose]();
						} else if (operation < 2) await start(owner, key);
						else if (operation === 2) await cancel(owner, random(2) ? key : undefined);
						else {
							const candidates = entries.filter((entry) => entry.pending && entry.started);
							const entry = candidates[random(candidates.length || 1)];
							if (entry) {
								entry.pending = false;
								history.push(`${operation === 3 ? 'complete' : 'fail'}:${entry.id}`);
								const result = operation === 3 ? entry.id : new Error(`failure ${entry.id}`);
								if (result instanceof Error) entry.reject(result);
								else entry.resolve(result);
								expect(await entry.outcome).toBe(result);
							}
						}
						await settleSelection();
						for (const entry of entries) {
							const released = entry.started && !entry.pending ? 1 : 0;
							expect(entry.cleaned, history.join(';')).toBe(released);
							expect(entry.disposed, history.join(';')).toBe(released);
						}
						for (const owner of [0, 1]) {
							for (const key of ['all', 'a', 'b'] as const) {
								const expected = entries.filter(
									(entry) =>
										entry.pending && entry.owner === owner && (key === 'all' || entry.key === key)
								);
								const status = statuses[owner]![key];
								expect(status.pendingCount, history.join(';')).toBe(expected.length);
								expect(status.pending, history.join(';')).toBe(expected.length > 0);
								if (key !== 'all' && concurrency !== 'parallel')
									expect(expected.filter((entry) => entry.started)).toHaveLength(
										Math.min(expected.length, 1)
									);
							}
						}
					}
				} finally {
					await Promise.all(owners.map((owner) => owner[Symbol.asyncDispose]()));
				}
				for (const status of statuses) expect(status.all.pendingCount).toBe(0);
				for (const entry of entries) {
					expect(entry.cleaned).toBe(Number(entry.started));
					expect(entry.disposed).toBe(Number(entry.started));
				}
			}
		);
	}
}
