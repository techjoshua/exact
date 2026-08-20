import { describe, expect, it } from 'vitest';
import { parseExactRequestBody, readBody } from './protocol.js';

describe('server request graph validation', () => {
	it('cancels a blocked request stream when its request lifetime aborts', async () => {
		let cancelled = false;
		const controller = new AbortController();
		const body = new ReadableStream<Uint8Array>({
			cancel() {
				cancelled = true;
			}
		});
		const reading = readBody({ method: 'POST', bodyStream: body, signal: controller.signal });
		controller.abort(new Error('disconnected'));
		await expect(reading).rejects.toThrow('disconnected');
		expect(cancelled).toBe(true);
	});

	it('reconstructs validated reactive collection envelopes without a second graph pass', () => {
		const request = parseExactRequestBody(
			JSON.stringify({
				type: 'invoke',
				id: 'save',
				payload: {
					labels: { $exact: 'set', version: 1, values: ['fragile', 'insured'] },
					rates: {
						$exact: 'map',
						version: 1,
						entries: [
							['ground', 12],
							['air', 24]
						]
					}
				}
			})
		);

		expect(request.type).toBe('invoke');
		if (request.type !== 'invoke') throw new Error('expected invocation');
		expect(request.payload).toEqual({
			labels: new Set(['fragile', 'insured']),
			rates: new Map([
				['ground', 12],
				['air', 24]
			])
		});
	});

	it('rejects accessors before protocol decoding can observe them', () => {
		let reads = 0;
		const payload = Object.create(Object.prototype);
		Object.defineProperty(payload, 'secret', {
			enumerable: true,
			get() {
				reads++;
				return 'not-safe';
			}
		});

		expect(() => parseExactRequestBody({ type: 'invoke', id: 'save', payload })).toThrow(
			'request graph limit exceeded'
		);
		expect(reads).toBe(0);
	});

	it('rejects non-JSON request objects even when JSON.stringify would erase them', () => {
		expect(() =>
			parseExactRequestBody({ type: 'invoke', id: 'save', payload: new Map([['rate', 12]]) })
		).toThrow('request graph limit exceeded');
	});

	it('retains depth, node, byte, envelope, and finite-number rejection', () => {
		const deep: Record<string, unknown> = {};
		let cursor = deep;
		for (let index = 0; index < 8; index++) {
			const next: Record<string, unknown> = {};
			cursor.next = next;
			cursor = next;
		}

		expect(() =>
			parseExactRequestBody({ type: 'invoke', id: 'save', payload: deep }, { maxJsonDepth: 4 })
		).toThrow('request graph limit exceeded');
		expect(() =>
			parseExactRequestBody(
				{ type: 'invoke', id: 'save', payload: { one: 1, two: 2 } },
				{ maxJsonNodes: 3 }
			)
		).toThrow('request graph limit exceeded');
		expect(() =>
			parseExactRequestBody(JSON.stringify({ type: 'invoke', id: 'save', payload: 'large' }), {
				maxRequestBytes: 16
			})
		).toThrow('request byte limit exceeded');
		expect(() =>
			parseExactRequestBody({
				type: 'invoke',
				id: 'save',
				payload: { $exact: 'set', version: 2, values: [] }
			})
		).toThrow('Malformed eXact Set envelope');
		expect(() =>
			parseExactRequestBody({ type: 'invoke', id: 'save', payload: Number.NaN })
		).toThrow('request graph limit exceeded');
	});
});
