import { expect, it } from 'vitest';
import { TaskCancellation, isTaskCancellation, raceTaskCancellation } from './cancellation.js';
import { executeTaskFrame } from './frame-runtime.js';
import { runTaskFrame } from '../framework/task-frames.js';
import { verifyTaskCancellationContract } from '../../../component-composition-corpus/test-support/task-cancellation-contract-journey.mjs';

it('executes the shared cancellation ownership journey', () =>
	verifyTaskCancellationContract({ TaskCancellation, isTaskCancellation, runTaskFrame }));

it.each(['method', 'getter', 'primitive'] as const)(
	'preserves a cancellation reason whose %s conversion fails',
	async (mode) => {
		const reason: unknown =
			mode === 'getter'
				? {
						get toString(): never {
							throw new Error('conversion');
						}
					}
				: mode === 'primitive'
					? {
							[Symbol.toPrimitive](): never {
								throw new Error('conversion');
							}
						}
					: {
							toString(): never {
								throw new Error('conversion');
							}
						};
		const cancellation = new TaskCancellation(reason);
		expect(cancellation.reason).toBe(reason);
		expect(isTaskCancellation(cancellation)).toBe(true);
		const controller = new AbortController();
		controller.abort(reason);
		const raced = await raceTaskCancellation(controller.signal, Promise.resolve(1)).catch(
			(error: unknown) => error
		);
		if (!isTaskCancellation(raced)) throw new Error('Expected cancellation');
		expect(raced.reason).toBe(reason);
		const framed = await executeTaskFrame({ controller }, () => 'unreachable').catch(
			(error: unknown) => error
		);
		if (!isTaskCancellation(framed)) throw new Error('Expected frame cancellation');
		expect(framed.reason).toBe(reason);
	}
);

it('does not invoke hostile rejection prototype traps while classifying failure', async () => {
	const error = new Proxy(
		{},
		{
			getPrototypeOf() {
				throw new Error('prototype trap');
			}
		}
	);
	await expect(
		executeTaskFrame({}, () => {
			throw error;
		})
	).rejects.toBe(error);
	expect(isTaskCancellation(error)).toBe(false);
});

it.each([undefined, null, false, 0, 'cancelled'])(
	'keeps ordinary cancellation messages and exact reasons: %s',
	(reason) => {
		const error = new TaskCancellation(reason);
		expect(error.reason).toBe(reason);
		expect(error.message).toBe(
			reason === undefined ? 'Component task was cancelled' : String(reason)
		);
		expect(isTaskCancellation(Object.assign(new Error('ordinary'), { name: 'AbortError' }))).toBe(
			false
		);
	}
);
