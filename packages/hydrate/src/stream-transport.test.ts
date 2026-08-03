/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { invokeExact, invokeExactBatch } from './invocations.js';
import { ndjsonResponse } from './test-support/responses.js';

describe('@exactjs/hydrate stream-transport', () => {
	it('invokes streaming exact endpoints directly', async () => {
		let requestHeaders: Record<string, string> | undefined;
		const result = await invokeExact({
			endpoint: '/__exact',
			type: 'refresh',
			id: 'panel',
			stream: true,
			fetch: async (_input, init) => {
				requestHeaders = init.headers;
				return {
					ok: true,
					status: 200,
					body: ndjsonResponse([
						{ event: 'start', version: 1, operations: 1 },
						{
							event: 'result',
							version: 1,
							index: 0,
							result: {
								ok: true,
								type: 'refresh',
								id: 'panel',
								patches: [{ type: 'replace', id: 'panel', html: '<p>Ready</p>' }]
							}
						},
						{ event: 'complete', version: 1 }
					]),
					async json() {
						throw new Error('json should not be read for streaming responses');
					}
				};
			}
		});

		expect(requestHeaders?.accept).toBe('application/x-ndjson');
		expect(result).toEqual({
			patches: [{ type: 'replace', id: 'panel', html: '<p>Ready</p>' }]
		});
	});

	it('parses out-of-order streaming batch results into request order', async () => {
		const results = await invokeExactBatch({
			endpoint: '/__exact',
			stream: true,
			operations: [
				{ type: 'invoke', id: 'save', opId: 'slow' },
				{ type: 'refresh', id: 'panel', opId: 'fast' }
			],
			fetch: async () => ({
				ok: true,
				status: 200,
				body: ndjsonResponse([
					{ event: 'start', version: 1, operations: 2 },
					{
						event: 'state',
						version: 1,
						index: 1,
						type: 'refresh',
						id: 'panel',
						opId: 'fast',
						value: { fast: true }
					},
					{
						event: 'result',
						version: 1,
						index: 1,
						result: { ok: true, type: 'refresh', id: 'panel', opId: 'fast' }
					},
					{
						event: 'state',
						version: 1,
						index: 0,
						type: 'invoke',
						id: 'save',
						opId: 'slow',
						value: { slow: true }
					},
					{
						event: 'result',
						version: 1,
						index: 0,
						result: { ok: true, type: 'invoke', id: 'save', opId: 'slow' }
					},
					{ event: 'complete', version: 1 }
				]),
				async json() {
					throw new Error('json should not be read for streaming responses');
				}
			})
		});

		expect(results).toEqual([
			{ ok: true, type: 'invoke', id: 'save', opId: 'slow', state: { slow: true } },
			{ ok: true, type: 'refresh', id: 'panel', opId: 'fast', state: { fast: true } }
		]);
	});
});
