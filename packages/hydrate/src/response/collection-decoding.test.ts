import { registerReactiveListKey } from '@exactjs/reactive';
import { encodeReactiveProtocolValue } from '@exactjs/core';
import { expect, it } from 'vitest';
import {
	parseExactBatchResponse,
	parseExactInvocationResponse,
	readExactStreamResponse
} from '../responses.js';
import { ndjsonResponse } from '../test-support/responses.js';
import {
	invocationCollectionValue,
	verifyInvocationCollectionValue
} from '../../../component-composition-corpus/test-support/invocation-collection-journey.js';

const operation = { type: 'invoke' as const, id: 'collections', opId: 'collections:1' };
type Mode = 'single' | 'batch' | 'stream';

async function decode(mode: Mode, result: object) {
	const encoded = encodeReactiveProtocolValue({ ok: true, ...operation, ...result });
	if (mode === 'single') return parseExactInvocationResponse(encoded, 'malformed', operation);
	const decoded =
		mode === 'batch'
			? parseExactBatchResponse(
					encodeReactiveProtocolValue({
						ok: true,
						version: 1,
						results: [{ ok: true, ...operation, ...result }]
					}),
					[operation]
				)[0]!
			: (
					await readExactStreamResponse(
						{
							body: ndjsonResponse([
								{ event: 'start', version: 1, operations: 1 },
								{ event: 'result', version: 1, index: 0, result: encoded },
								{ event: 'complete', version: 1 }
							])
						},
						[operation]
					)
				)[0]!;
	if (!decoded.ok) throw new Error('Unexpected failed invocation');
	return decoded;
}

it.each(['single', 'batch', 'stream'] as const)(
	'decodes invocation collections once (%s)',
	async (mode) => {
		const decoded = await decode(mode, {
			value: invocationCollectionValue(),
			state: invocationCollectionValue(),
			contexts: { Shared: invocationCollectionValue() }
		});
		verifyInvocationCollectionValue(decoded.value);
		verifyInvocationCollectionValue(decoded.state);
		verifyInvocationCollectionValue(decoded.contexts?.Shared);
	}
);

it.each(['single', 'batch', 'stream'] as const)(
	'retains transported keyed-list metadata (%s)',
	async (mode) => {
		const rows = [{ id: 'one' }, { id: 'two' }];
		registerReactiveListKey(
			rows,
			(value) => (value as { id: string }).id,
			'decode-once',
			'member:id'
		);
		const decoded = await decode(mode, { value: rows });
		expect(decoded.value).toEqual(rows);
		expect(encodeReactiveProtocolValue(decoded.value)).toMatchObject({
			$exact: 'keyed-collection',
			keys: ['one', 'two']
		});
	}
);

it.each(['single', 'batch', 'stream'] as const)(
	'retains result validation after decoding (%s)',
	async (mode) => {
		for (const malformed of [
			{ unexpected: true },
			{ type: 'other' },
			{ id: '' },
			{ opId: 42 },
			{ contexts: [] },
			{ mutations: [{ path: 'lookup', operation: 'map-set', key: {}, value: 'invalid' }] }
		])
			await expect(decode(mode, malformed)).rejects.toThrow(/malformed/);
		verifyInvocationCollectionValue(
			(await decode(mode, { value: invocationCollectionValue() })).value
		);
	}
);

it('retains decoded values in state, mutation, progress and patch chunks', async () => {
	let progress: unknown;
	const value = invocationCollectionValue();
	const events = [
		{ event: 'start', version: 1, operations: 1 },
		{ event: 'state', version: 1, index: 0, ...operation, value },
		{
			event: 'mutations',
			version: 1,
			index: 0,
			...operation,
			mutations: [{ path: 'lookup', operation: 'map-set', key: 'one', value }]
		},
		{
			event: 'progress',
			version: 1,
			index: 0,
			...operation,
			receiver: 'receiver',
			snapshot: value
		},
		{
			event: 'result',
			version: 1,
			index: 0,
			result: { ok: true, ...operation, patches: [{ type: 'state', id: 'boundary', value }] }
		},
		{ event: 'complete', version: 1 }
	];
	const [result] = await readExactStreamResponse(
		{ body: ndjsonResponse(events.map((event) => encodeReactiveProtocolValue(event))) },
		[operation],
		{
			progress: [
				{
					receivers: ['receiver'],
					report(_receiver, snapshot) {
						progress = snapshot;
					},
					close() {}
				}
			]
		}
	);
	if (!result?.ok) throw new Error('Unexpected failed invocation');
	verifyInvocationCollectionValue(result.state);
	const mutation = result.mutations?.[0];
	if (mutation?.operation !== 'map-set') throw new Error('Missing map-set mutation');
	verifyInvocationCollectionValue(mutation.value);
	verifyInvocationCollectionValue(progress);
	const patch = result.patches?.[0];
	if (patch?.type !== 'state') throw new Error('Missing state patch');
	verifyInvocationCollectionValue(patch.value);
});
