import { describe, expect, it, vi } from 'vitest';
import {
	defineExactActionContract,
	defineExactBoundaryContract,
	handleExactRequest
} from './index.js';
import { dispatchExactBatch } from './streaming.js';
import { context, readNextStreamLine, readRemainingStreamEvents } from './test-support/server.js';

describe('@exactjs/server batching', () => {
	it('dispatches batched operations with independent ordered results', async () => {
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'batch',
					version: 1,
					operations: [
						{ type: 'action', id: 'allowed-action', payload: { title: 'Ready' } },
						{ type: 'refresh', id: 'allowed-boundary' },
						{ type: 'action', id: 'missing-action' }
					]
				}
			},
			context()
		);

		expect(result.status).toBe(200);
		expect(JSON.parse(result.body)).toEqual({
			ok: true,
			version: 1,
			results: [
				{
					ok: true,
					type: 'action',
					id: 'allowed-action',
					patches: [{ type: 'text', id: 'title', value: 'Ready' }]
				},
				{
					ok: true,
					type: 'refresh',
					id: 'allowed-boundary',
					patches: [{ type: 'replace', id: 'allowed-boundary', html: '<section>Updated</section>' }]
				},
				{
					ok: false,
					type: 'action',
					id: 'missing-action',
					status: 404,
					error: 'not_found'
				}
			]
		});
	});

	it('runs independent batch operations concurrently while preserving result order', async () => {
		const started: string[] = [];
		let resolveSlow!: () => void;
		const slow = new Promise<void>((resolve) => {
			resolveSlow = resolve;
		});

		const pending = handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'batch',
					operations: [
						{ type: 'action', id: 'allowed-action', opId: 'slow' },
						{ type: 'refresh', id: 'allowed-boundary', opId: 'fast' }
					]
				}
			},
			context({
				contract: actionStateContract('slow'),
				actions: {
					'allowed-action': async () => {
						started.push('slow');
						await slow;
						return { state: { slow: true } };
					}
				},
				refreshBoundaries: {
					'allowed-boundary': () => {
						started.push('fast');
						return { state: { fast: true } };
					}
				}
			})
		);

		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(started).toEqual(['slow', 'fast']);
		resolveSlow();

		const result = await pending;
		expect(JSON.parse(result.body)).toMatchObject({
			ok: true,
			version: 1,
			results: [
				{ ok: true, type: 'action', id: 'allowed-action', opId: 'slow', state: { slow: true } },
				{ ok: true, type: 'refresh', id: 'allowed-boundary', opId: 'fast', state: { fast: true } }
			]
		});
	});

	it('aborts and drains sibling batch work when dispatch rejects', async () => {
		let siblingAborted = false;
		let siblingSettled = false;
		const request = { method: 'POST' };
		const operations = [
			{ type: 'action' as const, id: 'fail', opId: 'fail' },
			{ type: 'action' as const, id: 'sibling', opId: 'sibling' }
		];
		await expect(
			dispatchExactBatch(request, operations, context(), async (ownedRequest, operation) => {
				if (operation.id === 'fail') throw new Error('dispatch failed');
				return await new Promise((resolve) => {
					ownedRequest.signal!.addEventListener(
						'abort',
						() => {
							siblingAborted = true;
							siblingSettled = true;
							resolve({
								ok: false,
								type: operation.type,
								id: operation.id,
								status: 499,
								error: 'internal_error'
							});
						},
						{ once: true }
					);
				});
			})
		).rejects.toThrow('dispatch failed');
		expect(siblingAborted).toBe(true);
		expect(siblingSettled).toBe(true);
	});

	it('rejects oversized batches and bounds dispatch concurrency', async () => {
		const rejected = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'batch',
					operations: [
						{ type: 'action', id: 'allowed-action' },
						{ type: 'action', id: 'allowed-action' }
					]
				}
			},
			context({ limits: { maxBatchOperations: 1 } })
		);
		expect(rejected.status).toBe(400);

		let active = 0;
		let peak = 0;
		let release!: () => void;
		const gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		const pending = handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'batch',
					operations: Array.from({ length: 6 }, (_, index) => ({
						type: 'action',
						id: 'allowed-action',
						opId: `op-${index}`
					}))
				}
			},
			context({
				limits: { maxBatchConcurrency: 2 },
				actions: {
					'allowed-action': async () => {
						active++;
						peak = Math.max(peak, active);
						await gate;
						active--;
						return {};
					}
				}
			})
		);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(active).toBe(2);
		release();
		expect((await pending).status).toBe(200);
		expect(peak).toBe(2);
	});

	it('streams independent batch results as each operation settles', async () => {
		let resolveSlow!: () => void;
		const slow = new Promise<void>((resolve) => {
			resolveSlow = resolve;
		});

		const result = await handleExactRequest(
			{
				method: 'POST',
				headers: { 'x-exact-stream': '1' },
				body: {
					type: 'batch',
					operations: [
						{ type: 'action', id: 'allowed-action', opId: 'slow' },
						{ type: 'refresh', id: 'allowed-boundary', opId: 'fast' }
					]
				}
			},
			context({
				contract: actionStateContract('slow'),
				actions: {
					'allowed-action': async () => {
						await slow;
						return { state: { slow: true } };
					}
				},
				refreshBoundaries: {
					'allowed-boundary': () => ({ state: { fast: true } })
				}
			})
		);

		const reader = result.stream!.getReader();
		const first = JSON.parse(await readNextStreamLine(reader));
		const fastState = JSON.parse(await readNextStreamLine(reader));
		const fastResult = JSON.parse(await readNextStreamLine(reader));
		expect(first).toEqual({ event: 'start', version: 1, operations: 2 });
		expect(fastState).toMatchObject({
			event: 'state',
			version: 1,
			index: 1,
			type: 'refresh',
			id: 'allowed-boundary',
			opId: 'fast',
			value: { fast: true }
		});
		expect(fastResult).toMatchObject({
			event: 'result',
			version: 1,
			index: 1,
			result: { ok: true, type: 'refresh', id: 'allowed-boundary', opId: 'fast' }
		});

		resolveSlow();
		const remaining = await readRemainingStreamEvents(reader);
		expect(remaining).toEqual([
			{
				event: 'state',
				version: 1,
				index: 0,
				type: 'action',
				id: 'allowed-action',
				opId: 'slow',
				value: { slow: true }
			},
			{
				event: 'result',
				version: 1,
				index: 0,
				result: { ok: true, type: 'action', id: 'allowed-action', opId: 'slow' }
			},
			{ event: 'complete', version: 1 }
		]);
	});

	it('skips dependent batch operations when prerequisites fail', async () => {
		const refresh = vi.fn();
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'batch',
					operations: [
						{ type: 'action', id: 'missing-action', opId: 'save' },
						{ type: 'refresh', id: 'allowed-boundary', opId: 'refresh', dependsOn: ['save'] }
					]
				}
			},
			context({
				refreshBoundaries: {
					'allowed-boundary': refresh
				}
			})
		);

		expect(result.status).toBe(200);
		expect(refresh).not.toHaveBeenCalled();
		expect(JSON.parse(result.body)).toEqual({
			ok: true,
			version: 1,
			results: [
				{
					ok: false,
					type: 'action',
					id: 'missing-action',
					opId: 'save',
					status: 404,
					error: 'not_found'
				},
				{
					ok: false,
					type: 'refresh',
					id: 'allowed-boundary',
					opId: 'refresh',
					status: 424,
					error: 'dependency_failed'
				}
			]
		});
	});

	it('runs dependent batch operations after successful prerequisites', async () => {
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'batch',
					operations: [
						{ type: 'action', id: 'allowed-action', opId: 'save', payload: { title: 'Ready' } },
						{ type: 'refresh', id: 'allowed-boundary', opId: 'refresh', dependsOn: ['save'] }
					]
				}
			},
			context()
		);

		expect(result.status).toBe(200);
		expect(JSON.parse(result.body)).toMatchObject({
			ok: true,
			version: 1,
			results: [
				{
					ok: true,
					type: 'action',
					id: 'allowed-action',
					opId: 'save'
				},
				{
					ok: true,
					type: 'refresh',
					id: 'allowed-boundary',
					opId: 'refresh'
				}
			]
		});
	});

	it('rejects malformed batch envelopes before dispatch', async () => {
		const action = vi.fn();
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'batch',
					operations: [{ type: 'action', id: 'allowed-action' }],
					module: '../server/private'
				}
			},
			context({
				actions: {
					'allowed-action': action
				}
			})
		);

		expect(result.status).toBe(400);
		expect(action).not.toHaveBeenCalled();
	});

	it('rejects duplicate batch operation ids before dispatch', async () => {
		const action = vi.fn();
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'batch',
					operations: [
						{ type: 'action', id: 'allowed-action', opId: 'save' },
						{ type: 'action', id: 'allowed-action', opId: 'save' }
					]
				}
			},
			context({
				actions: {
					'allowed-action': action
				}
			})
		);

		expect(result.status).toBe(400);
		expect(JSON.parse(result.body)).toEqual({ error: 'bad_request' });
		expect(action).not.toHaveBeenCalled();
	});

	it('rejects unauthorized batches before dispatch', async () => {
		const action = vi.fn();
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'batch',
					operations: [{ type: 'action', id: 'allowed-action' }]
				}
			},
			context({
				actions: {
					'allowed-action': action
				},
				authorize: (_request, input) => input.type !== 'batch'
			})
		);

		expect(result.status).toBe(403);
		expect(action).not.toHaveBeenCalled();
	});
});

function actionStateContract(path: string) {
	return {
		version: 1 as const,
		actions: {
			'allowed-action': defineExactActionContract('allowed-action', {
				writes: [{ path, kind: 'write', confidence: 'exact' }]
			})
		},
		boundaries: {
			'allowed-boundary': defineExactBoundaryContract('allowed-boundary')
		}
	};
}
