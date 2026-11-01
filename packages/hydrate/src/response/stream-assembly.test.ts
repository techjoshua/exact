import { expect, it } from 'vitest';
import { readExactStreamResponse } from './stream.js';
import { ndjsonResponse } from '../test-support/responses.js';

const identity = { type: 'invoke' as const, id: 'save' };

/** Builds one complete operation stream with optional payload chunks. */
function stream(chunks: unknown[], result: object) {
	return {
		body: ndjsonResponse([
			{ event: 'start', version: 1, operations: 1 },
			...chunks,
			{ event: 'result', version: 1, index: 0, result: { ok: true, ...identity, ...result } },
			{ event: 'complete', version: 1 }
		])
	};
}

it('retains patches from chunks and the terminal result in wire order', async () => {
	const first = { type: 'text', id: 'first', value: 'A' };
	const second = { type: 'text', id: 'second', value: 'B' };
	const response = stream([{ event: 'patch', version: 1, index: 0, ...identity, patch: first }], {
		patches: [second]
	});
	const [result] = await readExactStreamResponse(response, [identity]);
	expect(result).toMatchObject({ ok: true, patches: [first, second] });
});

it.each(['state', 'html', 'mutations'])(
	'rejects conflicting %s data in both a chunk and terminal result',
	async (field) => {
		const mutations = [{ path: 'values', operation: 'map-set', key: 'key', value: 1 }];
		const value = field === 'state' ? { count: 1 } : field === 'html' ? '<p>one</p>' : mutations;
		const chunk = {
			event: field,
			version: 1,
			index: 0,
			...identity,
			...(field === 'state' ? { value } : { [field]: value })
		};
		await expect(
			readExactStreamResponse(stream([chunk], { [field]: value }), [identity])
		).rejects.toThrow('malformed events');
	}
);

it.each(['chunk', 'terminal'])(
	'preserves a single mutation payload from the %s representation',
	async (representation) => {
		const mutations = [{ path: 'values', operation: 'map-set', key: 'key', value: 1 }];
		const response =
			representation === 'chunk'
				? stream([{ event: 'mutations', version: 1, index: 0, ...identity, mutations }], {})
				: stream([], { mutations });
		expect(await readExactStreamResponse(response, [identity])).toMatchObject([
			{ ok: true, mutations }
		]);
	}
);

it('enforces the combined patch budget across chunk and terminal data', async () => {
	const patch = { type: 'text', id: 'title', value: 'ready' };
	const chunks = [{ event: 'patch', version: 1, index: 0, ...identity, patch }];
	await expect(
		readExactStreamResponse(stream(chunks, { patches: [patch] }), [identity], { maxPatches: 1 })
	).rejects.toThrow(/maxPatches: actual 2 patches, configured cap 1/);
	await expect(
		readExactStreamResponse(stream(chunks, { patches: [patch] }), [identity], { maxPatches: 2 })
	).resolves.toMatchObject([{ patches: [patch, patch] }]);
});

it('keeps output selections with their state chunk and rejects a selector-only terminal result', async () => {
	const state = { nested: { value: 'after' } };
	const statePaths = ['nested.value'];
	const response = stream(
		[{ event: 'state', version: 1, index: 0, ...identity, value: state, statePaths }],
		{}
	);
	expect(await readExactStreamResponse(response, [identity])).toMatchObject([
		{ state, statePaths }
	]);
	await expect(readExactStreamResponse(stream([], { statePaths }), [identity])).rejects.toThrow(
		'malformed'
	);
});
