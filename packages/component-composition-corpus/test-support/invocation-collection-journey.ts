/** Supplies collections and literal envelope-shaped records through every response transport. */
export function invocationCollectionValue() {
	return {
		map: new Map([['one', new Set(['nested'])]]),
		set: new Set(['member']),
		literal: { $exact: 'map', version: 1, entries: [['literal', 'record']] },
		ordinary: { value: 'unchanged' },
		ownUndefined: undefined,
		constants: [undefined, NaN, Infinity, -Infinity, -0],
		rows: [{ id: 'one' }, { id: 'two' }]
	};
}

/** Checks decoded native values and quoted records without depending on their wire representation. */
export function verifyInvocationCollectionValue(
	value: unknown,
	encode?: (value: unknown) => unknown
): void {
	if (!value || typeof value !== 'object') throw new Error('Missing invocation collection value');
	const result = value as ReturnType<typeof invocationCollectionValue>;
	if (
		!Object.hasOwn(result, 'ownUndefined') ||
		result.ownUndefined !== undefined ||
		![undefined, NaN, Infinity, -Infinity, -0].every((constant, index) =>
			Object.is(result.constants[index], constant)
		)
	)
		throw new Error('Invocation constants or own-property presence changed');
	const nested = result.map instanceof Map ? result.map.get('one') : undefined;
	if (!(nested instanceof Set) || [...nested].join() !== 'nested' || result.map.size !== 1)
		throw new Error('Invocation Map lost its nested collection');
	if (!(result.set instanceof Set) || [...result.set].join() !== 'member')
		throw new Error('Invocation Set lost its membership');
	if (
		result.literal instanceof Map ||
		JSON.stringify(result.literal) !== JSON.stringify(invocationCollectionValue().literal)
	)
		throw new Error('Invocation literal collection tag was decoded again');
	if (result.ordinary?.value !== 'unchanged') throw new Error('Invocation ordinary record changed');
	if (encode) {
		const encoded = encode(result.rows) as { $exact?: string; keys?: string[] };
		if (encoded?.$exact !== 'keyed-collection' || encoded.keys?.join() !== 'one,two')
			throw new Error('Invocation keyed-list metadata was lost');
	}
}

/** Exercises the actual single and batch transports with both JSON and streamed responses. */
export async function verifyInvocationCollectionTransports(
	api: Pick<typeof import('../../hydrate/src/invocations.js'), 'invokeExact' | 'invokeExactBatch'> &
		Pick<typeof import('@exactjs/core'), 'encodeReactiveProtocolValue'>,
	endpoint: string,
	fetch?: import('../../hydrate/src/types.js').FetchLike
): Promise<void> {
	const operation = {
		type: 'invoke' as const,
		id: 'serialization',
		payload: { kind: 'native-collections' }
	};
	for (const stream of [false, true]) {
		const single = await api.invokeExact({ endpoint, ...operation, stream, fetch });
		verifyInvocationCollectionValue(single.value, api.encodeReactiveProtocolValue);
		const batch = await api.invokeExactBatch({
			endpoint,
			operations: [operation, { ...operation, payload: { kind: 'shared-siblings' } }],
			stream,
			fetch
		});
		if (batch.length !== 2 || batch.some((result) => !result.ok))
			throw new Error('Collection batch identity or success changed');
		if (!batch[0]!.ok || !batch[1]!.ok) throw new Error('Collection batch failed');
		verifyInvocationCollectionValue(batch[0]!.value, api.encodeReactiveProtocolValue);
		const sibling = batch[1]!.value as { left: { count: number }; right: { count: number } };
		if (sibling.left?.count !== 1 || sibling.right?.count !== 1)
			throw new Error('Collection batch overwrote its ordinary sibling');
	}
}

/** Checks DOM state-patch publication using the same codec consumed by subsequent readers. */
export function verifyStatePatchPublication(
	api: Pick<typeof import('../../hydrate/src/patches.js'), 'applyPatches'> &
		Pick<
			typeof import('@exactjs/core'),
			'encodeReactiveProtocolValue' | 'decodeReactiveProtocolValue'
		>,
	document: Document
): void {
	const container = document.createElement('main');
	container.innerHTML = '<div data-exact-id="panel"></div>';
	const state = invocationCollectionValue();
	if (!api.applyPatches(container, [{ type: 'state', id: 'panel', value: state }]))
		throw new Error('State patch publication failed');
	verifyInvocationCollectionValue(
		api.decodeReactiveProtocolValue(
			JSON.parse(container.firstElementChild!.getAttribute('data-exact-state')!)
		)
	);
	for (const value of [undefined, NaN, Infinity, -Infinity, -0]) {
		if (!api.applyPatches(container, [{ type: 'state', id: 'panel', value }]))
			throw new Error('Scalar state patch publication failed');
		const decoded = api.decodeReactiveProtocolValue(
			JSON.parse(container.firstElementChild!.getAttribute('data-exact-state')!)
		);
		if (!Object.is(decoded, value)) throw new Error('Scalar state patch changed its value');
	}
}
