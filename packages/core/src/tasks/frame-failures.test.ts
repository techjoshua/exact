import { expect, it, vi } from 'vitest';
import { runTaskFrame } from '../framework/task-frames.js';
import { executeServerComponentTaskSlice } from './server-component-task-slice.js';
import {
	verifyTaskFailureOwnership,
	verifySettledChildCancellation
} from '../../../component-composition-corpus/test-support/task-failure-ownership-journey.mjs';
import {
	currentTaskFrameRecord,
	executeTaskFrame,
	taskFrameSynchronousError,
	type TaskFrameRecord
} from './frame-runtime.js';
import { acquireScheduledReactionBatch } from './scheduled-reactions.js';

it.each([undefined, null, false, 'failure'])(
	'retains a synchronous frame failure independently of its value: %s',
	async (error) => {
		const execution = executeTaskFrame({}, () => {
			throw error;
		});
		const rejected = expect(execution).rejects.toBe(error);
		expect(taskFrameSynchronousError(execution)).toEqual({ error });
		await rejected;
	}
);

it.each(['frame', 'slice'] as const)(
	'preserves failure and cleanup ownership: %s',
	async (mode) => {
		await verifyTaskFailureOwnership((work) =>
			mode === 'frame'
				? runTaskFrame({ kind: 'failure' }, { work })
				: executeServerComponentTaskSlice(new AbortController().signal, undefined, work, [])
		);
	}
);

it('does not retroactively abort a settled child when its parent cancels', () =>
	verifySettledChildCancellation(runTaskFrame));

it('releases the parent cancellation link of a completed inline reactive consequence', async () => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	let consequence!: TaskFrameRecord;
	let signal!: AbortSignal;
	const parent = runTaskFrame(
		{ kind: 'parent' },
		{
			work() {
				const lease = acquireScheduledReactionBatch(currentTaskFrameRecord()!);
				lease.run(() => {
					consequence = currentTaskFrameRecord()!;
					signal = consequence.controller.signal;
				});
				return gate;
			}
		}
	);
	const parentOutcome = parent.catch((error: unknown) => error);
	try {
		await vi.waitFor(() => expect(consequence.settled).toBe(true));
		parent.cancel('parent stopped');
		expect(signal.aborted).toBe(false);
		await parentOutcome;
	} finally {
		release();
		await parentOutcome;
	}
});
