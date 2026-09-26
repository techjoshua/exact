import { expect, it, vi } from 'vitest';
import { TaskCancellation } from '@exactjs/core';
import { dispatchExactOperation } from './operations.js';
import { context } from './test-support/server.js';

it.each(['reason', 'task'] as const)(
	'classifies %s cancellation without reporting an invocation error',
	async (kind) => {
		const controller = new AbortController();
		const log = vi.fn();
		let markStarted!: () => void;
		const started = new Promise<void>((resolve) => {
			markStarted = resolve;
		});
		const pending = dispatchExactOperation(
			{ method: 'POST', signal: controller.signal },
			{ type: 'invoke', id: 'allowed-action' },
			context({
				logger: { isEnabled: () => true, log },
				invocations: {
					'allowed-action': (_input, scope) =>
						new Promise((_resolve, reject) => {
							markStarted();
							scope.signal!.addEventListener(
								'abort',
								() =>
									reject(
										kind === 'task'
											? new TaskCancellation(scope.signal!.reason)
											: scope.signal!.reason
									),
								{ once: true }
							);
						})
				}
			})
		);
		await started;
		controller.abort(new DOMException('Client disconnected', 'AbortError'));
		expect(await pending).toMatchObject({ ok: false, status: 499 });
		expect(log).not.toHaveBeenCalled();
	}
);

it.each([false, true])('retains actual operation failures when aborted=%s', async (aborted) => {
	const controller = new AbortController();
	const log = vi.fn();
	const failure = new Error('Application failure');
	const result = await dispatchExactOperation(
		{ method: 'POST', signal: controller.signal },
		{ type: 'invoke', id: 'allowed-action' },
		context({
			logger: { isEnabled: () => true, log },
			invocations: {
				'allowed-action': () => {
					if (aborted) controller.abort('disconnected');
					throw failure;
				}
			}
		})
	);
	expect(result).toMatchObject({ ok: false, status: 500 });
	expect(log).toHaveBeenCalledOnce();
});
