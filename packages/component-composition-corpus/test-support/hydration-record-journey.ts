type HydrationRecordApi = Pick<
	typeof import('@exactjs/reactive'),
	'reactive' | 'registerReactiveListKey'
> &
	Pick<typeof import('@exactjs/core'), 'decodeReactiveProtocolValue'> &
	Pick<typeof import('@exactjs/ssr'), 'renderHydrationScript'>;

function literalRecords(): Array<Record<string, unknown>> {
	return [
		{ $exact: 'map', version: 1, entries: [] },
		{ $exact: 'set', version: 1, values: [] },
		{ $exact: 'keyed-collection', version: 1 },
		{ $exact: 'map', version: 2, record: [] },
		{ $exact: 'record', version: 1 },
		JSON.parse('{"$exact":"map","version":1,"__proto__":{"safe":true},"constructor":"data"}'),
		{ $exact: 'map', version: 1, constant: 'undefined' }
	];
}

/** Checks restored ordinary records, true collections and keyed items after server or browser decoding. */
export function verifyHydrationRecordState(value: unknown): void {
	const state = value as {
		records: Array<Record<string, unknown>>;
		rows: Array<{ id: string; record: unknown }>;
		map: Map<string, unknown>;
		set: Set<unknown>;
		constants: unknown[];
		ownUndefined: unknown;
	};
	const records = literalRecords();
	const check = (value: boolean, message: string) => {
		if (!value) throw new Error('Hydration record transport: ' + message);
	};
	check(
		Object.hasOwn(state, 'ownUndefined') && state.ownUndefined === undefined,
		'undefined retains an own property'
	);
	check(
		[undefined, NaN, Infinity, -Infinity, -0].every((value, index) =>
			Object.is(state.constants[index], value)
		),
		'constants retain their ordinary values'
	);
	check(
		Array.isArray(state?.records) && state.records.length === records.length,
		'all literal records survive'
	);
	for (let index = 0; index < records.length; index++)
		check(
			Object.getPrototypeOf(state.records[index]) === Object.prototype &&
				JSON.stringify(state.records[index]) === JSON.stringify(records[index]),
			'literal tag ' + index + ' remains an ordinary record'
		);
	check(
		state.map instanceof Map &&
			JSON.stringify(state.map.get('record')) === JSON.stringify(records[0]),
		'reactive native Map retains its literal value'
	);
	check(
		state.set instanceof Set && JSON.stringify([...state.set][0]) === JSON.stringify(records[1]),
		'native Set retains literal values'
	);
	check(
		Array.isArray(state.rows) &&
			state.rows[0]?.id === 'a' &&
			JSON.stringify(state.rows[0].record) === JSON.stringify(records[0]),
		'keyed array items retain literal fields'
	);
	check(
		Object.hasOwn(state.records[5]!, '__proto__') && !Object.hasOwn(Object.prototype, 'safe'),
		'dangerous property names stay data'
	);
}

/** Publishes one reactive document graph, verifies server decoding and wire limits, and returns its script for actual browser reading. */
export function createHydrationRecordScript(api: HydrationRecordApi): string {
	const records = literalRecords();
	const state = api.reactive({
		records,
		constants: [undefined, NaN, Infinity, -Infinity, -0],
		ownUndefined: undefined,
		rows: [{ id: 'a', record: records[0] }],
		map: new Map([['record', records[0]]]),
		set: new Set([records[1]])
	});
	const release = api.registerReactiveListKey(
		state.rows,
		(item) => (item as { id: string }).id,
		'hydration-record-journey',
		'id'
	);
	try {
		const script = api.renderHydrationScript({ state });
		const encoded = JSON.parse(script.match(/>(.*)<\/script>/s)![1]!);
		const decoded = api.decodeReactiveProtocolValue(encoded) as { state: unknown };
		verifyHydrationRecordState(decoded.state);
		let rejected = false;
		try {
			api.renderHydrationScript({ state: { values: new Set(['value']) }, maxHydrationNodes: 6 });
		} catch (error) {
			rejected = error instanceof Error && error.message.includes('graph limits');
		}
		if (!rejected)
			throw new Error('Hydration record transport: encoded graph must respect publication limits');
		return script;
	} finally {
		release();
	}
}

/** Checks the default encoded-node budget after keyed metadata expands otherwise valid island props. */
export async function verifyIslandPublicationBudget(
	api: Pick<typeof import('@exactjs/reactive'), 'registerReactiveListKey'> & {
		renderToString(operation: import('@exactjs/core').Child): Promise<{ html: string }>;
	} & Pick<typeof import('@exactjs/core/runtime/render'), 'createServerBoundary'>
): Promise<void> {
	const rows = Array.from({ length: 21_000 }, (_, index) => ({ id: String(index), value: index }));
	await api.renderToString(api.createServerBoundary('ordinary', 'Ordinary', { rows }));
	const release = api.registerReactiveListKey(
		rows,
		(item) => (item as { id: string }).id,
		'island-wire-budget',
		'id'
	);
	try {
		// Ordinary arrays fit. Only compiler-owned keyed metadata pushes this graph over the wire budget.
		let failure: unknown;
		try {
			await api.renderToString(api.createServerBoundary('large', 'Large', { rows }));
		} catch (error) {
			failure = error;
		}
		if (!(failure instanceof Error && failure.message.includes('graph limits')))
			throw new Error(
				'Hydration record transport: keyed island graph must respect publication limits'
			);
	} finally {
		release();
	}
}
