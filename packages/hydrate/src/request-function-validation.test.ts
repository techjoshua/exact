import { decodeReactiveProtocolValue } from '@exactjs/reactive';
import { captureArraySubmission } from '@exactjs/reactive/framework/array-patch';
import { expect, it, vi } from 'vitest';
import { invokeExact, invokeExactBatch, invokePreparedExact } from './invocations.js';

it('rejects authored methods before single or batched requests are sent', async () => {
	const method = {
		trim() {
			return 'replacement';
		}
	};
	const fetch = vi.fn();
	const operation = {
		type: 'invoke' as const,
		id: 'trim',
		payload: { dependencies: [method] }
	};
	const endpoint = '/__exact';
	await expect(invokeExact({ ...operation, endpoint, fetch })).rejects.toThrow(
		'Cannot send a function'
	);
	await expect(
		invokeExactBatch({
			endpoint,
			operations: [
				{ ...operation, payload: { dependencies: [' first '] } },
				{ ...operation, payload: { dependencies: [{ $exact: 'map', ...method }] } }
			],
			fetch
		})
	).rejects.toThrow('Cannot send a function');
	expect(fetch).not.toHaveBeenCalled();
});

it('preserves string receivers and supported values in invocation dependencies', async () => {
	const dependencies = [
		' first ',
		undefined,
		-0,
		new Map([['value', new Set([Infinity])]]),
		{ $exact: 'map', value: NaN }
	];
	let received: unknown;
	await invokeExact({
		endpoint: '/__exact',
		type: 'invoke',
		id: 'trim',
		payload: { dependencies },
		fetch: async (_url, init) => {
			received = decodeReactiveProtocolValue(JSON.parse(init.body).payload);
			return {
				ok: true,
				status: 200,
				json: async () => ({ ok: true, type: 'invoke', id: 'trim' })
			};
		}
	});
	expect(received).toEqual({ dependencies });
});

it('samples invalid prepared state once in property order before rejecting it at dispatch', async () => {
	const reads: string[] = [];
	const row = {
		get first() {
			reads.push('first');
			return 'first';
		},
		get trim() {
			reads.push('trim');
			return () => 'authored';
		},
		get last() {
			reads.push('last');
			return 'last';
		}
	};
	const capture = captureArraySubmission({ rows: [row] }, [{ path: ['rows'] }]);
	const fetch = vi.fn();
	try {
		await expect(
			invokePreparedExact(
				{ endpoint: '/__exact', type: 'invoke', id: 'trim', arrayCompletion: 4, fetch },
				{
					encoded: capture.encodedState,
					valueDepth: capture.valueDepth,
					transportError: capture.transportError
				}
			)
		).rejects.toThrow('Cannot send a function');
		expect(reads).toEqual(['first', 'trim', 'last']);
		expect(fetch).not.toHaveBeenCalled();
	} finally {
		capture.release();
	}
});
