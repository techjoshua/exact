import { registerReactiveListKey } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import { defineExactOperationContract, handleExactRequest } from './index.js';
import { context, readStreamEvents } from './test-support/server.js';

describe('@exactjs/server security-validation', () => {
	it('reports opt-in request timings', async () => {
		const onProfile = vi.fn();

		const response = await handleExactRequest({ method: 'GET' }, context({ onProfile }));

		expect(response.status).toBe(405);
		expect(onProfile).toHaveBeenCalledWith(
			expect.objectContaining({
				subsystem: 'server',
				phase: 'request',
				elapsedMs: expect.any(Number)
			})
		);
	});

	it('accepts a transport-safe continuation return value', async () => {
		const response = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'invoke', id: 'allowed-action' }
			},
			context({
				invocations: {
					'allowed-action': () => ({ value: { status: 'ready' } })
				}
			})
		);

		expect(response.status).toBe(200);
		expect(JSON.parse(response.body).value).toEqual({ status: 'ready' });
	});

	it('encodes registered keyed collections in response state', async () => {
		const records = [
			{ id: 'a', title: 'A' },
			{ id: 'b', title: 'B' }
		];
		registerReactiveListKey(
			records,
			(item) => (item as { id: string }).id,
			'server response test',
			'member:id'
		);
		const response = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'invoke', id: 'allowed-action' }
			},
			context({
				contract: recordsStateContract(),
				invocations: {
					'allowed-action': () => ({ state: { records } })
				}
			})
		);
		const body = JSON.parse(response.body);
		expect(body.state.records).toMatchObject({
			$exact: 'keyed-collection',
			version: 1,
			keys: ['a', 'b']
		});

		const streamed = await handleExactRequest(
			{
				method: 'POST',
				headers: { accept: 'application/x-ndjson' },
				body: { type: 'invoke', id: 'allowed-action' }
			},
			context({
				contract: recordsStateContract(),
				invocations: {
					'allowed-action': () => ({ state: { records } })
				}
			})
		);
		const events = await readStreamEvents(streamed.stream!);
		const stateEvent = events.find((event: any) => event.event === 'state') as any;
		expect(stateEvent?.value.records).toMatchObject({
			$exact: 'keyed-collection',
			version: 1,
			keys: ['a', 'b']
		});
	});

	it('enforces authorization and csrf hooks before dispatch', async () => {
		const action = vi.fn();
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'invoke', id: 'allowed-action' }
			},
			context({
				invocations: { 'allowed-action': action },
				authorize: () => true,
				validateCsrf: () => false
			})
		);

		expect(result.status).toBe(403);
		expect(action).not.toHaveBeenCalled();
	});

	it('runs security hooks once for single operation requests', async () => {
		const authorize = vi.fn(() => true);
		const validateCsrf = vi.fn(() => true);
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'invoke', id: 'allowed-action', payload: { title: 'Ready' } }
			},
			context({
				authorize,
				validateCsrf
			})
		);

		expect(result.status).toBe(200);
		expect(authorize).toHaveBeenCalledOnce();
		expect(validateCsrf).toHaveBeenCalledOnce();
	});

	it('fails closed when authorization or csrf hooks throw', async () => {
		const authAction = vi.fn();
		const authResult = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'invoke', id: 'allowed-action' }
			},
			context({
				invocations: { 'allowed-action': authAction },
				authorize: () => {
					throw new Error('auth store unavailable');
				}
			})
		);

		expect(authResult.status).toBe(403);
		expect(JSON.parse(authResult.body)).toEqual({ error: 'forbidden' });
		expect(authAction).not.toHaveBeenCalled();

		const csrfAction = vi.fn();
		const csrfResult = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'invoke', id: 'allowed-action' }
			},
			context({
				invocations: { 'allowed-action': csrfAction },
				validateCsrf: () => {
					throw new Error('csrf store unavailable');
				}
			})
		);

		expect(csrfResult.status).toBe(403);
		expect(JSON.parse(csrfResult.body)).toEqual({ error: 'forbidden' });
		expect(csrfAction).not.toHaveBeenCalled();
	});

	it('rejects requests outside the configured endpoint', async () => {
		const action = vi.fn();
		const result = await handleExactRequest(
			{
				method: 'POST',
				url: '/wrong',
				body: { type: 'invoke', id: 'allowed-action' }
			},
			context({
				contract: {
					version: 1,
					endpoint: '/__exact',
					invocations: {
						'allowed-action': defineExactOperationContract('allowed-action')
					},
					boundaries: {}
				},
				invocations: { 'allowed-action': action }
			})
		);

		expect(result.status).toBe(404);
		expect(JSON.parse(result.body)).toEqual({ error: 'not_found' });
		expect(action).not.toHaveBeenCalled();
	});

	it('rejects malformed and non-json-safe payloads', async () => {
		const malformed = await handleExactRequest(
			{
				method: 'POST',
				body: '{'
			},
			context()
		);

		expect(malformed.status).toBe(400);

		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		const unsafe = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'invoke', id: 'allowed-action', payload: cyclic }
			},
			context()
		);

		expect(unsafe.status).toBe(400);
	});

	it('rejects invocation requests with unknown protocol fields', async () => {
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'invoke',
					id: 'allowed-action',
					module: '../server/private'
				}
			},
			context()
		);

		expect(result.status).toBe(400);
		expect(JSON.parse(result.body)).toEqual({ error: 'bad_request' });
	});

	it('normalizes undefined optional request fields like JSON transport', async () => {
		const action = vi.fn((_request: unknown) => ({ patches: [] }));
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'invoke',
					id: 'allowed-action',
					opId: undefined,
					dependsOn: undefined,
					payload: undefined,
					state: undefined,
					boundaryHtml: undefined,
					boundaryHtmls: undefined
				}
			},
			context({
				invocations: { 'allowed-action': action }
			})
		);

		expect(result.status).toBe(200);
		expect(action).toHaveBeenCalledOnce();
		expect(action.mock.calls[0][0]).toEqual({
			type: 'invoke',
			id: 'allowed-action'
		});
	});

	it('rejects malformed invocation results before returning them to clients', async () => {
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'invoke', id: 'allowed-action' }
			},
			context({
				invocations: {
					'allowed-action': () => ({
						patches: [{ type: 'replace', id: 1, html: '<p>bad</p>' } as any]
					})
				}
			})
		);

		expect(result.status).toBe(500);
		expect(JSON.parse(result.body)).toEqual({ error: 'internal_error' });
	});

	it('rejects undefined invocation result fields that would disappear during JSON serialization', async () => {
		const undefinedState = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'invoke', id: 'allowed-action' }
			},
			context({
				invocations: {
					'allowed-action': () => ({ state: undefined })
				}
			})
		);

		expect(undefinedState.status).toBe(500);
		expect(JSON.parse(undefinedState.body)).toEqual({ error: 'internal_error' });

		const undefinedPropPatch = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'invoke', id: 'allowed-action' }
			},
			context({
				invocations: {
					'allowed-action': () => ({
						patches: [{ type: 'prop', id: 'panel', name: 'title', value: undefined } as any]
					})
				}
			})
		);

		expect(undefinedPropPatch.status).toBe(500);
		expect(JSON.parse(undefinedPropPatch.body)).toEqual({ error: 'internal_error' });

		const undefinedStatePatch = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'invoke', id: 'allowed-action' }
			},
			context({
				invocations: {
					'allowed-action': () => ({
						patches: [{ type: 'state', id: 'panel', value: undefined } as any]
					})
				}
			})
		);

		expect(undefinedStatePatch.status).toBe(500);
		expect(JSON.parse(undefinedStatePatch.body)).toEqual({ error: 'internal_error' });
	});

	it('rejects invocation results and patches with unknown protocol fields', async () => {
		const extraResult = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'invoke', id: 'allowed-action' }
			},
			context({
				invocations: {
					'allowed-action': () =>
						({
							patches: [],
							module: '../server/private'
						}) as any
				}
			})
		);

		expect(extraResult.status).toBe(500);

		const extraPatch = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'invoke', id: 'allowed-action' }
			},
			context({
				invocations: {
					'allowed-action': () => ({
						patches: [
							{ type: 'replace', id: 'panel', html: '<p />', module: '../server/private' } as any
						]
					})
				}
			})
		);

		expect(extraPatch.status).toBe(500);
	});

	it('passes boundary html snapshots to refresh handlers', async () => {
		const refresh = vi.fn((input) => ({
			patches: [
				{ type: 'replace' as const, id: 'allowed-boundary', html: String(input.boundaryHtml ?? '') }
			]
		}));
		const result = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'refresh',
					id: 'allowed-boundary',
					boundaryHtml: '<p>Previous</p>'
				}
			},
			context({
				refreshBoundaries: {
					'allowed-boundary': refresh
				}
			})
		);

		expect(result.status).toBe(200);
		expect(refresh).toHaveBeenCalledWith(
			expect.objectContaining({
				boundaryHtml: '<p>Previous</p>'
			}),
			expect.any(Object)
		);
	});
});

function recordsStateContract() {
	return {
		version: 1 as const,
		invocations: {
			'allowed-action': defineExactOperationContract('allowed-action', {
				writes: [{ path: 'records', kind: 'write', confidence: 'exact' }]
			})
		},
		boundaries: {}
	};
}
