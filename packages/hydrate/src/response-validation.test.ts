/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { readExactHydrationConfig } from './config.js';
import { invokeExact, invokeExactBatch } from './invocations.js';
import { ndjsonResponse } from './test-support/responses.js';

describe('@exactjs/hydrate response-validation', () => {
	it('ignores malformed endpoint routes in the hydration bootstrap script', () => {
		const root = document.createElement('main');
		root.innerHTML =
			'<script type="application/json" id="__exact_hydration">{"endpoint":"/__exact","endpoints":{"invocations":{"save":1}},"state":{"ready":true}}</script>';

		expect(readExactHydrationConfig(root)).toEqual({
			endpoint: '/__exact',
			state: { ready: true }
		});
	});

	it('ignores malformed continuation contracts in the hydration bootstrap script', () => {
		const root = document.createElement('main');
		root.innerHTML =
			'<script type="application/json" id="__exact_hydration">{"endpoint":"/__exact","continuations":{"save":{"id":"save","componentId":"test:save","dependencies":[],"stateReads":[{"path":"project.id","kind":"inspect","confidence":"exact"}],"stateWrites":[],"publicContexts":[],"serverContexts":[],"contextWrites":[],"boundaries":[]}}}</script>';

		expect(readExactHydrationConfig(root)).toEqual({
			endpoint: '/__exact'
		});
	});

	it('rejects malformed streaming response events', async () => {
		await expect(
			invokeExactBatch({
				endpoint: '/__exact',
				stream: true,
				operations: [
					{ type: 'invoke', id: 'save' },
					{ type: 'refresh', id: 'panel' }
				],
				fetch: async () => ({
					ok: true,
					status: 200,
					body: ndjsonResponse([
						{ event: 'start', version: 1, operations: 2 },
						{
							event: 'result',
							version: 1,
							index: 0,
							result: { ok: true, type: 'invoke', id: 'save', state: { saved: true } }
						},
						{ event: 'complete', version: 1 }
					]),
					async json() {
						throw new Error('json should not be read for streaming responses');
					}
				})
			})
		).rejects.toThrow('eXact stream invocation returned malformed events');
	});

	it('enforces streamed response byte and event ceilings incrementally', async () => {
		const fetch = async () => ({
			ok: true,
			status: 200,
			body: ndjsonResponse([
				{ event: 'start', version: 1, operations: 1 },
				{ event: 'result', version: 1, index: 0, result: { ok: true, type: 'invoke', id: 'save' } },
				{ event: 'complete', version: 1 }
			]),
			async json() {
				throw new Error('json should not be read');
			}
		});
		await expect(
			invokeExact({
				endpoint: '/__exact',
				type: 'invoke',
				id: 'save',
				stream: true,
				streamLimits: { maxBytes: 16 },
				fetch
			})
		).rejects.toThrow('exceeded maxBytes');
		await expect(
			invokeExact({
				endpoint: '/__exact',
				type: 'invoke',
				id: 'save',
				stream: true,
				streamLimits: { maxEvents: 2 },
				fetch
			})
		).rejects.toThrow('exceeded maxEvents');
	});

	it('rejects stream chunks emitted after an operation result', async () => {
		await expect(
			invokeExact({
				endpoint: '/__exact',
				type: 'invoke',
				id: 'save',
				stream: true,
				fetch: async () => ({
					ok: true,
					status: 200,
					body: ndjsonResponse([
						{ event: 'start', version: 1, operations: 1 },
						{
							event: 'result',
							version: 1,
							index: 0,
							result: { ok: true, type: 'invoke', id: 'save' }
						},
						{
							event: 'state',
							version: 1,
							index: 0,
							type: 'invoke',
							id: 'save',
							value: { late: true }
						},
						{ event: 'complete', version: 1 }
					]),
					async json() {
						throw new Error('json should not be read');
					}
				})
			})
		).rejects.toThrow('malformed events');
	});

	it('rejects mismatched operation identities in JSON and streamed responses', async () => {
		await expect(
			invokeExact({
				endpoint: '/__exact',
				type: 'invoke',
				id: 'save',
				fetch: async () => ({
					ok: true,
					status: 200,
					async json() {
						return { ok: true, type: 'invoke', id: 'other' };
					}
				})
			})
		).rejects.toThrow('malformed result');

		await expect(
			invokeExactBatch({
				endpoint: '/__exact',
				stream: true,
				operations: [{ type: 'invoke', id: 'save', opId: 'save-op' }],
				fetch: async () => ({
					ok: true,
					status: 200,
					body: ndjsonResponse([
						{ event: 'start', version: 1, operations: 1 },
						{
							event: 'result',
							version: 1,
							index: 0,
							result: { ok: true, type: 'invoke', id: 'other', opId: 'save-op' }
						},
						{ event: 'complete', version: 1 }
					]),
					async json() {
						throw new Error('json should not be read');
					}
				})
			})
		).rejects.toThrow('malformed results');

		await expect(
			invokeExactBatch({
				endpoint: '/__exact',
				stream: true,
				operations: [
					{ type: 'invoke', id: 'save' },
					{ type: 'refresh', id: 'panel' }
				],
				fetch: async () => ({
					ok: true,
					status: 200,
					body: ndjsonResponse([
						{ event: 'start', version: 1, operations: 2 },
						{
							event: 'state',
							version: 1,
							index: 0,
							type: 'refresh',
							id: 'panel',
							value: { swapped: true }
						}
					]),
					async json() {
						throw new Error('json should not be read');
					}
				})
			})
		).rejects.toThrow('malformed events');
	});

	it('rejects malformed UTF-8 and oversized non-stream responses', async () => {
		await expect(
			invokeExact({
				endpoint: '/__exact',
				type: 'invoke',
				id: 'save',
				stream: true,
				fetch: async () => ({
					ok: true,
					status: 200,
					body: new ReadableStream<Uint8Array>({
						start(controller) {
							controller.enqueue(new Uint8Array([0xff]));
							controller.close();
						}
					}),
					async json() {
						throw new Error('json should not be read');
					}
				})
			})
		).rejects.toThrow('malformed events');

		await expect(
			invokeExact({
				endpoint: '/__exact',
				type: 'invoke',
				id: 'save',
				streamLimits: { maxBytes: 32 },
				fetch: async () => ({
					ok: true,
					status: 200,
					async text() {
						return JSON.stringify({ ok: true, type: 'invoke', id: 'save', html: 'x'.repeat(100) });
					},
					async json() {
						throw new Error('json should not be read');
					}
				})
			})
		).rejects.toThrow('exceeded maxBytes');

		await expect(
			invokeExact({
				endpoint: '/__exact',
				type: 'invoke',
				id: 'save',
				streamLimits: { maxBytes: 32 },
				fetch: async () => ({
					ok: true,
					status: 200,
					async json() {
						return { ok: true, type: 'invoke', id: 'save', html: 'x'.repeat(100) };
					}
				})
			})
		).rejects.toThrow('exceeded maxBytes');
	});

	it('enforces streamed patch limits and rejects duplicate singleton chunks', async () => {
		const response = (events: unknown[]) => async () => ({
			ok: true,
			status: 200,
			body: ndjsonResponse(events),
			async json() {
				throw new Error('json should not be read');
			}
		});
		await expect(
			invokeExact({
				endpoint: '/__exact',
				type: 'invoke',
				id: 'save',
				stream: true,
				streamLimits: { maxPatches: 1 },
				fetch: response([
					{ event: 'start', version: 1, operations: 1 },
					{
						event: 'patch',
						version: 1,
						index: 0,
						type: 'invoke',
						id: 'save',
						patch: { type: 'text', id: 'a', value: 'A' }
					},
					{
						event: 'patch',
						version: 1,
						index: 0,
						type: 'invoke',
						id: 'save',
						patch: { type: 'text', id: 'b', value: 'B' }
					}
				])
			})
		).rejects.toThrow('malformed events');

		await expect(
			invokeExact({
				endpoint: '/__exact',
				type: 'invoke',
				id: 'save',
				stream: true,
				fetch: response([
					{ event: 'start', version: 1, operations: 1 },
					{ event: 'state', version: 1, index: 0, type: 'invoke', id: 'save', value: { count: 1 } },
					{ event: 'state', version: 1, index: 0, type: 'invoke', id: 'save', value: { count: 2 } }
				])
			})
		).rejects.toThrow('malformed events');
	});

	it('rejects malformed successful exact invocation responses', async () => {
		await expect(
			invokeExact({
				endpoint: '/__exact',
				type: 'invoke',
				id: 'save',
				fetch: async () => ({
					ok: true,
					status: 200,
					async json() {
						return {
							patches: [{ type: 'text', id: 'title', value: 'Saved' }]
						};
					}
				})
			})
		).rejects.toThrow('eXact invoke invocation returned malformed result');

		await expect(
			invokeExact({
				endpoint: '/__exact',
				type: 'invoke',
				id: 'save',
				fetch: async () => ({
					ok: true,
					status: 200,
					async json() {
						return {
							ok: true,
							patches: [{ type: 'state', id: 'profile', value: undefined }]
						};
					}
				})
			})
		).rejects.toThrow('eXact invoke invocation returned malformed result');

		await expect(
			invokeExact({
				endpoint: '/__exact',
				type: 'invoke',
				id: 'save',
				fetch: async () => ({
					ok: true,
					status: 200,
					async json() {
						return {
							ok: true,
							state: { savedAt: new Date('2026-01-01T00:00:00.000Z') }
						};
					}
				})
			})
		).rejects.toThrow('eXact invoke invocation returned malformed result');

		const cyclicPatchValue: Record<string, unknown> = {};
		cyclicPatchValue.self = cyclicPatchValue;
		await expect(
			invokeExact({
				endpoint: '/__exact',
				type: 'invoke',
				id: 'save',
				fetch: async () => ({
					ok: true,
					status: 200,
					async json() {
						return {
							ok: true,
							patches: [{ type: 'text', id: 1, value: 'Saved' }]
						};
					}
				})
			})
		).rejects.toThrow('eXact invoke invocation returned malformed result');

		await expect(
			invokeExact({
				endpoint: '/__exact',
				type: 'invoke',
				id: 'save',
				fetch: async () => ({
					ok: true,
					status: 200,
					async json() {
						return {
							ok: true,
							state: undefined
						};
					}
				})
			})
		).rejects.toThrow('eXact invoke invocation returned malformed result');

		await expect(
			invokeExact({
				endpoint: '/__exact',
				type: 'invoke',
				id: 'save',
				fetch: async () => ({
					ok: true,
					status: 200,
					async json() {
						return {
							ok: true,
							patches: [{ type: 'state', id: 'profile', value: cyclicPatchValue }]
						};
					}
				})
			})
		).rejects.toThrow('eXact invoke invocation returned malformed result');
	});

	it('rejects malformed exact batch response envelopes', async () => {
		await expect(
			invokeExactBatch({
				endpoint: '/__exact',
				operations: [{ type: 'invoke', id: 'save' }],
				fetch: async () => ({
					ok: true,
					status: 200,
					async json() {
						return {
							version: 1,
							results: []
						};
					}
				})
			})
		).rejects.toThrow('eXact batch invocation returned malformed results');

		await expect(
			invokeExactBatch({
				endpoint: '/__exact',
				operations: [{ type: 'invoke', id: 'save' }],
				fetch: async () => ({
					ok: true,
					status: 200,
					async json() {
						return {
							ok: true,
							version: 1,
							results: [{ ok: true, type: 'invoke', id: 'save', opId: undefined, patches: [] }]
						};
					}
				})
			})
		).rejects.toThrow('eXact batch invocation returned malformed results');

		await expect(
			invokeExactBatch({
				endpoint: '/__exact',
				operations: [{ type: 'invoke', id: 'save' }],
				fetch: async () => ({
					ok: true,
					status: 200,
					async json() {
						return {
							ok: true,
							version: 2,
							results: []
						};
					}
				})
			})
		).rejects.toThrow('eXact batch invocation returned malformed results');

		await expect(
			invokeExactBatch({
				endpoint: '/__exact',
				operations: [{ type: 'invoke', id: 'save' }],
				fetch: async () => ({
					ok: true,
					status: 200,
					async json() {
						return {
							ok: true,
							version: 1,
							results: [],
							debug: true
						};
					}
				})
			})
		).rejects.toThrow('eXact batch invocation returned malformed results');
	});

	it('rejects malformed exact batch operation responses', async () => {
		await expect(
			invokeExactBatch({
				endpoint: '/__exact',
				operations: [{ type: 'invoke', id: 'save' }],
				fetch: async () => ({
					ok: true,
					status: 200,
					async json() {
						return {
							ok: true,
							version: 1,
							results: [
								{
									ok: true,
									type: 'invoke',
									id: 'save',
									patches: [{ type: 'replace', id: 1, html: '<p />' }]
								}
							]
						};
					}
				})
			})
		).rejects.toThrow('eXact batch invocation returned malformed results');
	});
});
