import { encodeReactiveProtocolValue, decodeReactiveProtocolValue } from '@exactjs/core';
import { expect, it } from 'vitest';
import {
	parseArrayNetMutation,
	captureArraySubmission
} from '@exactjs/reactive/framework/array-patch';
import { parseExactBatchResponse } from './batch.js';
import { readExactStreamResponse } from './stream.js';
import { invokeExact, invokePreparedExact, invokePreparedExactBatch } from '../invocations.js';
import { enqueueExactOperation } from '../batching.js';
import { parseExactInvocationResponse } from './json.js';
import type { ArrayResponseContext } from './json.js';
import type { ExactInvocationRequest } from '@exactjs/core/framework/operation-protocol';

const patch = { operation: 'array-net', path: 'rows', beforeLength: 1, members: [] } as const;
function contexts(calls: string[]) {
	const make = (name: string): ArrayResponseContext => ({
		version: 4,
		parse(value, onSlots) {
			calls.push(name);
			return parseArrayNetMutation(value, onSlots);
		}
	});
	return [make('a'), make('b')] as const;
}
const array = (id: string): ExactInvocationRequest => ({ type: 'invoke', id, arrayCompletion: 4 });
const plain: ExactInvocationRequest = { type: 'invoke', id: 'plain' };
function stream(events: unknown[]): { body: ReadableStream<Uint8Array> } {
	const encoded = new TextEncoder().encode(events.map((e) => JSON.stringify(e)).join('\n') + '\n');
	return {
		body: new ReadableStream({
			start(controller) {
				controller.enqueue(encoded);
				controller.close();
			}
		})
	};
}

it('selects distinct parser callbacks by operation, including a plain sibling', () => {
	const calls: string[] = [],
		[a, b] = contexts(calls),
		expected = [array('a'), plain, array('b')];
	const result = parseExactBatchResponse(
		{
			ok: true,
			version: 1,
			results: [
				{ ok: true, ...expected[0], mutations: [patch] },
				{ ok: true, ...plain, value: 1 },
				{ ok: true, ...expected[2], mutations: [patch] }
			]
		},
		expected,
		{ arrayCompletions: [a, undefined, b] }
	);
	expect(result).toHaveLength(3);
	expect(calls).toEqual(['a', 'b']);
});
it('never inherits a sibling parser, and requires zero-net success echo', () => {
	const calls: string[] = [],
		[a] = contexts(calls),
		expected = [array('a'), plain];
	expect(() =>
		parseExactBatchResponse(
			{
				ok: true,
				version: 1,
				results: [
					{ ok: true, ...expected[0] },
					{ ok: true, ...plain, mutations: [patch] }
				]
			},
			expected,
			{ arrayCompletions: [a, undefined] }
		)
	).toThrow();
	expect(() =>
		parseExactBatchResponse(
			{ ok: true, version: 1, results: [{ ok: true, type: 'invoke', id: 'a' }] },
			[array('a')],
			{ arrayCompletions: [a] }
		)
	).toThrow();
	expect(() =>
		parseExactBatchResponse(
			{ ok: true, version: 1, results: [{ ok: true, ...plain, arrayCompletion: 4 }] },
			[plain]
		)
	).toThrow();
	expect(calls).toEqual([]);
});
it('retains operation context through interleaved streamed mutations and terminal validation', async () => {
	const calls: string[] = [],
		[a, b] = contexts(calls),
		expected = [plain, array('b'), array('a')];
	const result = await readExactStreamResponse(
		stream([
			{ event: 'start', version: 1, operations: 3 },
			{ event: 'mutations', version: 1, index: 1, type: 'invoke', id: 'b', mutations: [patch] },
			{ event: 'result', version: 1, index: 0, result: { ok: true, ...plain } },
			{ event: 'mutations', version: 1, index: 2, type: 'invoke', id: 'a', mutations: [patch] },
			{ event: 'result', version: 1, index: 2, result: { ok: true, ...expected[2] } },
			{ event: 'result', version: 1, index: 1, result: { ok: true, ...expected[1] } },
			{ event: 'complete', version: 1 }
		]),
		expected,
		{ arrayCompletions: [undefined, b, a] }
	);
	expect(calls).toEqual(['b', 'a']);
	expect(result[1]?.ok && result[1].mutations).toEqual([patch]);
});
it('validates stream index and identity before invoking the selected parser', async () => {
	const calls: string[] = [],
		[a, b] = contexts(calls),
		expected = [array('a'), array('b')];
	await expect(
		readExactStreamResponse(
			stream([
				{ event: 'start', version: 1, operations: 2 },
				{ event: 'mutations', version: 1, index: -1, type: 'invoke', id: 'a', mutations: [patch] }
			]),
			expected,
			{ arrayCompletions: [a, b] }
		)
	).rejects.toThrow();
	await expect(
		readExactStreamResponse(
			stream([
				{ event: 'start', version: 1, operations: 2 },
				{ event: 'mutations', version: 1, index: 1, type: 'invoke', id: 'a', mutations: [patch] }
			]),
			expected,
			{ arrayCompletions: [a, b] }
		)
	).rejects.toThrow();
	expect(calls).toEqual([]);
});
it('sends the single-operation token and retains it in expected-result validation', async () => {
	const calls: string[] = [],
		[a] = contexts(calls);
	let request: unknown;
	const result = await invokeExact({
		endpoint: '/__exact',
		type: 'invoke',
		id: 'a',
		arrayCompletion: 4,
		arrayParser: a,
		fetch: async (_url, init) => {
			request = JSON.parse(init.body);
			return {
				ok: true,
				status: 200,
				json: async () => ({}),
				text: async () => JSON.stringify({ ok: true, type: 'invoke', id: 'a', arrayCompletion: 4 })
			};
		}
	});
	expect(request).toMatchObject({ arrayCompletion: 4 });
	expect(result.arrayCompletion).toBe(4);
});
it('filters canceled pending items before deriving request and parser vectors', async () => {
	const calls: string[] = [],
		[a, b] = contexts(calls),
		controller = new AbortController();
	let body: { operations: ExactInvocationRequest[] } | undefined;
	const fetch = async (_url: string, init: { body: string }) => {
		body = JSON.parse(init.body);
		return {
			ok: true,
			status: 200,
			json: async () => ({}),
			text: async () =>
				JSON.stringify({
					ok: true,
					version: 1,
					results: body!.operations.map((operation) => ({
						ok: true,
						...operation,
						...(operation.arrayCompletion ? { mutations: [patch] } : {})
					}))
				})
		};
	};
	const host = {} as Element;
	const canceled = enqueueExactOperation(host, {
		endpoint: '/__exact',
		operation: array('cancel'),
		arrayParser: a,
		signal: controller.signal,
		fetch
	});
	controller.abort(new Error('cancel'));
	const rejected = expect(canceled).rejects.toThrow('cancel');
	const first = enqueueExactOperation(host, {
		endpoint: '/__exact',
		operation: array('b'),
		arrayParser: b,
		fetch
	});
	const second = enqueueExactOperation(host, { endpoint: '/__exact', operation: plain, fetch });
	await Promise.all([first, second, rejected]);
	expect(body!.operations.map((o) => o.id)).toEqual(['b', 'plain']);
	expect(calls).toEqual(['b']);
});

it('does not inherit a single parser when the aligned stream context is absent', async () => {
	const calls: string[] = [],
		[a] = contexts(calls);
	await expect(
		readExactStreamResponse(
			stream([
				{ event: 'start', version: 1, operations: 1 },
				{ event: 'mutations', version: 1, index: 0, type: 'invoke', id: 'a', mutations: [patch] }
			]),
			[array('a')],
			{ arrayCompletion: a, arrayCompletions: [undefined] }
		)
	).rejects.toThrow();
	expect(calls).toEqual([]);
});

it('encodes submitted state once without escaping its actual codec capsules a second time', async () => {
	let reads = 0;
	const literal = encodeReactiveProtocolValue(new Map([['literal', 1]]));
	const row = {
			literal,
			get value() {
				reads++;
				return new Map([['actual', reads]]);
			}
		},
		rows = [row];
	const capture = captureArraySubmission({ rows }, [{ path: ['rows'] }]);
	const [parser] = contexts([]);
	let decoded: unknown;
	try {
		await invokePreparedExact(
			{
				endpoint: '/__exact',
				type: 'invoke',
				id: 'a',
				arrayCompletion: 4,
				arrayParser: parser,
				state: { rows },
				fetch: async (_url, init) => {
					decoded = decodeReactiveProtocolValue(JSON.parse(init.body));
					return {
						ok: true,
						status: 200,
						json: async () => ({}),
						text: async () =>
							JSON.stringify({ ok: true, type: 'invoke', id: 'a', arrayCompletion: 4 })
					};
				}
			},
			{ encoded: capture.encodedState, valueDepth: capture.valueDepth }
		);
	} finally {
		capture.release();
	}
	expect(reads).toBe(1);
	expect(decoded).toMatchObject({
		state: { rows: [{ literal, value: new Map([['actual', 1]]) }] }
	});
});
it('enforces prepared request bytes and the actual single versus batch logical depth before fetch', async () => {
	let deep: unknown = {};
	for (let i = 0; i < 95; i++) deep = { child: deep };
	const rows = [{ child: deep }],
		capture = captureArraySubmission({ rows }, [{ path: ['rows'] }]),
		prepared = { encoded: capture.encodedState, valueDepth: capture.valueDepth },
		[parser] = contexts([]);
	let fetched = 0;
	const fetch = async () => {
		fetched++;
		return {
			ok: true,
			status: 200,
			json: async () => ({}),
			text: async () => JSON.stringify({ ok: true, type: 'invoke', id: 'a', arrayCompletion: 4 })
		};
	};
	try {
		expect(capture.valueDepth).toBe(98);
		await invokePreparedExact(
			{
				endpoint: '/__exact',
				type: 'invoke',
				id: 'a',
				arrayCompletion: 4,
				arrayParser: parser,
				fetch
			},
			prepared
		);
		expect(fetched).toBe(1);
		await expect(
			invokePreparedExactBatch(
				{ endpoint: '/__exact', operations: [array('a')], arrayParsers: [parser], fetch },
				[prepared]
			)
		).rejects.toThrow('depth');
		expect(fetched).toBe(1);
		await expect(
			invokePreparedExact(
				{
					endpoint: '/__exact',
					type: 'invoke',
					id: 'a',
					arrayCompletion: 4,
					arrayParser: parser,
					fetch,
					streamLimits: { maxRequestBytes: 1 }
				},
				prepared
			)
		).rejects.toThrow('maxRequestBytes');
		expect(fetched).toBe(1);
	} finally {
		capture.release();
	}
});

it('charges compressed sparse sequence materialization to the existing explicit response node cap', () => {
	const [context] = contexts([]),
		value = {
			ok: true,
			type: 'invoke',
			id: 'a',
			arrayCompletion: 4,
			mutations: [
				{
					operation: 'array-net',
					path: 'rows',
					beforeLength: 0,
					span: { start: 0, deleteCount: 0, parts: [{ length: 1001, slots: [] }] },
					members: []
				}
			]
		};
	expect(() =>
		parseExactInvocationResponse(value, 'invalid', array('a'), {
			arrayCompletion: context,
			maxJsonNodes: 1000
		})
	).toThrow();
	const reports: unknown[] = [];
	expect(() =>
		parseExactInvocationResponse(
			{
				...value,
				mutations: [
					{
						...value.mutations[0],
						span: { start: 0, deleteCount: 0, parts: [{ length: 100001, slots: [] }] }
					}
				]
			},
			'invalid',
			array('a'),
			{ arrayCompletion: context, logger: { isEnabled: () => true, log: (r) => reports.push(r) } }
		)
	).not.toThrow();
	expect(reports.length).toBeGreaterThan(0);
});
