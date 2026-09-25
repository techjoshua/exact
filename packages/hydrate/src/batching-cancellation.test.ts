/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { enqueueExactOperation } from './batching.js';

it.each(['absent', 'live', 'aborted'] as const)(
	'preserves batch ownership with a %s sibling signal',
	async (mode) => {
		const sibling = mode === 'absent' ? undefined : new AbortController();
		const controller = new AbortController();
		let signal: AbortSignal | undefined;
		let finish!: () => void;
		const gate = new Promise<void>((resolve) => {
			finish = resolve;
		});
		const fetch = async (_input: string, init: { body: string; signal?: AbortSignal }) => {
			signal = init.signal;
			await gate;
			return {
				ok: true,
				status: 200,
				async json() {
					return {
						ok: true,
						version: 1,
						results: JSON.parse(init.body).operations.map((op: { type: string; id: string }) => ({
							...op,
							ok: true
						}))
					};
				}
			};
		};
		const container = document.createElement('main');
		const left = enqueueExactOperation(container, {
			endpoint: '/__exact',
			operation: { type: 'invoke', id: 'left' },
			fetch,
			signal: controller.signal
		});
		const right = enqueueExactOperation(container, {
			endpoint: '/__exact',
			operation: { type: 'invoke', id: 'right' },
			signal: sibling?.signal,
			fetch
		});
		const cancelled = expect(left).rejects.toBe('superseded');
		const retained =
			mode === 'aborted'
				? expect(right).rejects.toBe('superseded')
				: expect(right).resolves.toEqual({});
		await Promise.resolve();
		controller.abort('superseded');
		if (mode === 'aborted') sibling!.abort('superseded');
		const prematurelyAborted = signal?.aborted ?? false;
		finish();
		await cancelled;
		await retained;
		expect(prematurelyAborted).toBe(mode === 'aborted');
	}
);

it('drops cancellation before dispatch and admits a later request on the same transport', async () => {
	const controller = new AbortController();
	const sent: string[] = [];
	const fetch = async (_input: string, init: { body: string }) => {
		const request = JSON.parse(init.body);
		sent.push(request.id);
		return {
			ok: true,
			status: 200,
			async json() {
				return { ok: true, type: request.type, id: request.id, value: request.id };
			}
		};
	};
	const container = document.createElement('main');
	const first = enqueueExactOperation(container, {
		endpoint: '/__exact',
		fetch,
		operation: { type: 'invoke', id: 'old' },
		signal: controller.signal
	});
	const cancelled = expect(first).rejects.toBe('superseded');
	controller.abort('superseded');
	await cancelled;
	expect(sent).toEqual([]);
	await expect(
		enqueueExactOperation(container, {
			endpoint: '/__exact',
			fetch,
			operation: { type: 'invoke', id: 'next' }
		})
	).resolves.toEqual({ value: 'next' });
	expect(sent).toEqual(['next']);
});
