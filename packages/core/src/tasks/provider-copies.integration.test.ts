import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, it, onTestFinished } from 'vitest';
import { bindTask, createTaskOwner, taskStatus } from './v1.js';
import type { RuntimeTaskOptions } from './contracts.js';
import { TaskCancellation, isTaskCancellation } from './cancellation.js';

type TaskProvider = typeof import('./v1.js') &
	Pick<typeof import('./cancellation.js'), 'TaskCancellation' | 'isTaskCancellation'>;

import { runTaskFrame } from '../framework/task-frames.js';
import {
	frameForTaskContext,
	taskOwnerRecord,
	withDeferredTaskFrame,
	withTaskFrameRecord,
	withTaskOwnerRecord
} from './frame-runtime.js';

/** Owns a fresh physical provider copy and removes its generated bundle after the contract check. */
async function withBundledProvider(work: (provider: TaskProvider) => Promise<void>): Promise<void> {
	const root = await mkdtemp(path.join(tmpdir(), 'exact-task-providers-'));
	try {
		const output = path.join(root, 'provider.mjs');
		await build({
			stdin: {
				contents:
					"export * from './v1.ts'; export {TaskCancellation,isTaskCancellation} from './cancellation.ts';",
				resolveDir: fileURLToPath(new URL('.', import.meta.url))
			},
			bundle: true,
			platform: 'node',
			format: 'esm',
			outfile: output,
			logLevel: 'silent'
		});
		await work((await import(pathToFileURL(output).href)) as TaskProvider);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

it('recognizes cancellation across provider copies without recording it as an application failure', async () =>
	withBundledProvider(async (provider) => {
		await using owner = createTaskOwner();
		const host = new TaskCancellation('host');
		const foreign = new provider.TaskCancellation('foreign');
		expect(isTaskCancellation(foreign)).toBe(true);
		expect(provider.isTaskCancellation(host)).toBe(true);
		const task = provider.defineTask<[], number>({ owner }, () => {
			throw host;
		});
		await expect(Promise.resolve(task())).rejects.toBe(host);
		expect(taskStatus(task, { owner }).error).toBeUndefined();
		expect(isTaskCancellation(new DOMException('ordinary', 'AbortError'))).toBe(false);
	}));

it.each(['queue', 'latest', 'parallel'] as const)(
	'preserves %s ownership across independently bundled task providers',
	async (concurrency) =>
		withBundledProvider(async (provider) => {
			await using owner = createTaskOwner();
			let release!: () => void;
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			onTestFinished(release);
			let markFirstStarted!: () => void;
			let markSecondStarted!: () => void;
			const firstStarted = new Promise<void>((resolve) => {
				markFirstStarted = resolve;
			});
			const secondStarted = new Promise<void>((resolve) => {
				markSecondStarted = resolve;
			});
			const started: number[] = [];
			const signals: AbortSignal[] = [];
			const task = provider.defineTask<[number], number>(
				{ owner, concurrency } satisfies RuntimeTaskOptions<[number]>,
				async (value, context) => {
					started.push(value);
					signals.push(context.signal);
					if (value === 1) markFirstStarted();
					if (value === 2) markSecondStarted();
					await gate;
					return value;
				}
			);
			const bound = bindTask(task, { owner });
			const status = taskStatus(task, { owner });
			const first = Promise.resolve(task(1));
			// Observe rejection immediately so latest cancellation is never an unhandled result.
			const firstOutcome = first.then(
				(value) => ({ value }),
				(error: unknown) => ({ error })
			);
			await firstStarted;
			const second = Promise.resolve(bound(2));
			try {
				if (concurrency !== 'queue') await secondStarted;
				// Drain scheduled starts while the first task remains held. A split queue lane would
				// otherwise be hidden by checking before the second callback's scheduled turn.
				else await new Promise<void>((resolve) => setImmediate(resolve));
				expect(started).toEqual(concurrency === 'queue' ? [1] : [1, 2]);
				expect(status.pendingCount).toBeGreaterThan(0);
				if (concurrency === 'latest') expect(signals[0]!.aborted).toBe(true);
				else expect(signals[0]!.aborted).toBe(false);
			} finally {
				release();
				await Promise.allSettled([firstOutcome, second]);
			}
			const outcome = await firstOutcome;
			if (concurrency === 'latest') expect(outcome).toHaveProperty('error.name', 'AbortError');
			else expect(outcome).toEqual({ value: 1 });
			expect(await second).toBe(2);
			expect(started).toEqual([1, 2]);
			expect(status.pendingCount).toBe(0);
			expect(status.error).toBeUndefined();
			expect(await bound(3)).toBe(3);
			expect(status.result).toBe(3);
		})
);

it.each([
	{ detached: false, deferred: false },
	{ detached: false, deferred: true },
	{ detached: true, deferred: false }
])(
	'retains implicit ownership with detached=$detached, deferred=$deferred',
	async ({ detached, deferred }) =>
		withBundledProvider(async (provider) => {
			let release!: () => void;
			const gate = new Promise<void>((resolve) => {
				release = resolve;
			});
			onTestFinished(release);
			let markStarted!: () => void;
			const started = new Promise<void>((resolve) => {
				markStarted = resolve;
			});
			let childSignal!: AbortSignal;
			let childOutcome!: Promise<unknown>;
			let parentSettled = false;
			let materializations = 0;
			const child = provider.defineTask<[], string>({ detached }, async (context) => {
				childSignal = context.signal;
				markStarted();
				await gate;
				return 'child';
			});
			const parent = runTaskFrame(
				{ kind: 'provider-ownership' },
				{
					work(context) {
						const begin = () => {
							childOutcome = Promise.resolve(child()).catch((error: unknown) => error);
						};
						if (deferred) {
							const frame = frameForTaskContext(context);
							withTaskFrameRecord(undefined, () =>
								withDeferredTaskFrame(() => {
									materializations++;
									return frame;
								}, begin)
							);
						} else begin();
						return 'parent';
					}
				}
			);
			const parentOutcome = parent.then(
				(value) => {
					parentSettled = true;
					return value;
				},
				(error: unknown) => error
			);
			try {
				await started;
				await new Promise<void>((resolve) => setImmediate(resolve));
				expect(parentSettled).toBe(detached);
				expect(materializations).toBe(deferred ? 1 : 0);
				parent.cancel('cancel-parent');
				await new Promise<void>((resolve) => setImmediate(resolve));
				expect(childSignal.aborted).toBe(!detached);
			} finally {
				release();
				await Promise.allSettled([parentOutcome, childOutcome]);
			}
			expect(await provider.defineTask<[], string>({}, () => 'next')()).toBe('next');
			expect(() => provider.bindTask(child)).toThrow('explicit owner');
		})
);

it('retains setup ownership across providers and restores the outer scope after failure', async () =>
	withBundledProvider(async (provider) => {
		await using owner = createTaskOwner();
		const task = provider.defineTask<[], number>({}, () => 1);
		const bound = withTaskOwnerRecord(taskOwnerRecord(owner), () => provider.bindTask(task));
		expect(await bound()).toBe(1);
		expect(taskStatus(task, { owner }).result).toBe(1);
		expect(() =>
			withTaskOwnerRecord(taskOwnerRecord(owner), () => {
				provider.bindTask(task);
				throw new Error('scope-failure');
			})
		).toThrow('scope-failure');
		expect(() => provider.bindTask(task)).toThrow('explicit owner');
	}));
