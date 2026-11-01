type ReactiveProtocolApi = Pick<
	typeof import('@exactjs/reactive'),
	| 'encodeReactiveProtocolValue'
	| 'decodeReactiveProtocolValue'
	| 'reactive'
	| 'registerReactiveListKey'
> &
	Pick<typeof import('@exactjs/reactive/framework/protocol'), 'encodeValidatedReactiveCollection'>;

/** Supplies positional envelope defects that must fail before installing collection metadata. */
export function malformedCollectionEnvelopes(): Array<[string, unknown]> {
	const hole = () => new Array(1);
	const inherited = Object.setPrototypeOf(
		hole(),
		Object.assign(Object.create(Array.prototype), { 0: 'a' })
	);
	const keyed = {
		$exact: 'keyed-collection',
		version: 1,
		keys: ['a'],
		keyHash: '0'.repeat(32),
		itemHashes: ['0'.repeat(32)],
		itemsHash: '0'.repeat(32),
		items: [{ id: 'a' }]
	};
	return [
		['Map entries', { $exact: 'map', version: 1, entries: hole() }],
		[
			'Map value slot',
			{ $exact: 'map', version: 1, entries: [Object.assign(new Array(2), { 0: 'a' })] }
		],
		['Set members', { $exact: 'set', version: 1, values: hole() }],
		['keyed keys', { ...keyed, keys: hole() }],
		['keyed hashes', { ...keyed, itemHashes: hole() }],
		['keyed items', { ...keyed, items: hole() }],
		['inherited keys', { ...keyed, keys: inherited }],
		['Map version', { $exact: 'map', version: 2, entries: [] }],
		['Set version', { $exact: 'set', version: 2, values: [] }],
		['keyed version', { ...keyed, version: 2 }],
		['invalid item hash', { ...keyed, itemHashes: ['invalid'] }],
		['invalid key hash', { ...keyed, keyHash: null }],
		['invalid items hash', { ...keyed, itemsHash: 'invalid' }],
		[
			'duplicate keys',
			{
				...keyed,
				keys: ['a', 'a'],
				itemHashes: ['0'.repeat(32), '0'.repeat(32)],
				items: [{ id: 'a' }, { id: 'a' }]
			}
		],
		['extra fields', { ...keyed, extra: true }],
		['non-array entries', { $exact: 'map', version: 1, entries: {} }],
		['record rows', { $exact: 'map', version: 1, record: hole() }],
		[
			'record positional value',
			{ $exact: 'map', version: 1, record: [Object.assign(new Array(2), { 0: 'key' })] }
		],
		['record string key', { $exact: 'map', version: 1, record: [[0, 1]] }],
		[
			'record duplicate key',
			{
				$exact: 'map',
				version: 1,
				record: [
					['key', 1],
					['key', 2]
				]
			}
		],
		['record extra field', { $exact: 'map', version: 1, record: [], extra: true }],
		[
			'inherited version',
			Object.assign(Object.create({ version: 1 }), { $exact: 'map', entries: [] })
		]
	];
}

/** Runs the same collection decoding and recursive encoding controls in source and native hosts. */
export function verifyReactiveProtocolCollections(api: ReactiveProtocolApi): void {
	const check = (value: boolean, message: string) => {
		if (!value) throw new Error('Reactive protocol collections: ' + message);
	};
	const records = [{ id: 'a', value: 1 }];
	const release = api.registerReactiveListKey(
		records,
		(item) => (item as { id: string }).id,
		'protocol-journey',
		'member:id'
	);
	try {
		const state = api.reactive({ records, lookup: new Map([['a', new Set([1, 2])]]) });
		check(
			(api.encodeValidatedReactiveCollection(state.records, []) as { $exact?: string }).$exact ===
				'keyed-collection',
			'validated proxy arrays retain source metadata'
		);
		const roundTrip = (value: unknown) =>
			api.decodeReactiveProtocolValue(
				JSON.parse(JSON.stringify(api.encodeReactiveProtocolValue(value)))
			);
		for (const input of [state, { records: state.records, lookup: state.lookup }]) {
			const encoded = api.encodeReactiveProtocolValue(input) as { records: { $exact?: string } };
			check(
				encoded.records.$exact === 'keyed-collection',
				'nested reactive lists retain keyed metadata'
			);
			const decoded = roundTrip(input) as typeof state;
			check(
				decoded.lookup.get('a') instanceof Set && decoded.lookup.get('a')!.has(2),
				'nested reactive collections retain native contents'
			);
			check(decoded.records[0]!.value === 1, 'keyed items survive transport');
		}
		const literals = [
			{ $exact: 'map', version: 1, entries: [] },
			{ $exact: 'set', version: 1, values: [] },
			{ $exact: 'keyed-collection', version: 1 },
			{ $exact: 'map', version: 2, record: [] },
			{ $exact: 'record', version: 1, entries: [] },
			JSON.parse('{"$exact":"map","version":1,"__proto__":{"safe":true}}')
		];
		for (const input of literals) {
			for (const value of [input, api.reactive(input)]) {
				const decoded = roundTrip(value);
				check(
					Object.getPrototypeOf(decoded) === Object.prototype &&
						JSON.stringify(decoded) === JSON.stringify(input),
					'literal tag records retain ordinary JSON properties'
				);
			}
		}
		for (const value of [undefined, NaN, Infinity, -Infinity, -0]) {
			check(Object.is(roundTrip(value), value), 'top-level constants retain their value');
			const decoded = roundTrip({
				own: value,
				rows: [value],
				map: new Map([['key', value]]),
				set: new Set([value])
			}) as {
				own: unknown;
				rows: unknown[];
				map: Map<string, unknown>;
				set: Set<unknown>;
			};
			check(
				Object.hasOwn(decoded, 'own') && Object.is(decoded.own, value),
				'owned constants retain property presence'
			);
			check(
				Object.is(decoded.rows[0], value) &&
					Object.is(decoded.map.get('key'), value) &&
					decoded.set.has(value),
				'collection constants survive JSON'
			);
		}
		let constantHash: unknown;
		for (const value of [undefined, null, NaN, Infinity, -Infinity, -0, 0]) {
			const rows = [{ id: 'constant', value }];
			const releaseConstant = api.registerReactiveListKey(
				rows,
				(item) => (item as { id: string }).id,
				'constant-journey',
				'member:id'
			);
			try {
				const encoded = api.encodeReactiveProtocolValue(rows) as {
					$exact: string;
					itemsHash: string;
				};
				check(
					encoded.$exact === 'keyed-collection' && encoded.itemsHash !== constantHash,
					'keyed constants retain distinct item hashes'
				);
				constantHash = encoded.itemsHash;
			} finally {
				releaseConstant();
			}
		}
		const literal = literals[0]!;
		const mixed = roundTrip({
			map: new Map([['record', literal]]),
			set: new Set([literal]),
			record: literal
		}) as { map: Map<string, unknown>; set: Set<unknown>; record: unknown };
		check(
			mixed.map instanceof Map &&
				mixed.set instanceof Set &&
				JSON.stringify(mixed.map.get('record')) === JSON.stringify(literal) &&
				JSON.stringify(mixed.record) === JSON.stringify(literal),
			'native collections and literal records retain separate types'
		);

		for (const [name, envelope] of malformedCollectionEnvelopes()) {
			let rejected = false;
			try {
				api.decodeReactiveProtocolValue(envelope);
			} catch (error) {
				rejected = error instanceof TypeError && /Malformed eXact/.test(error.message);
			}
			check(rejected, name + ' must reject missing own slots');
		}
		const previous = api.encodeReactiveProtocolValue({ records: state.records }) as {
			records: { itemsHash: string };
		};
		state.records[0]!.value = 2;
		const updated = api.encodeReactiveProtocolValue({ records: state.records }) as typeof previous;
		check(
			previous.records.itemsHash !== updated.records.itemsHash,
			'nested proxy mutations refresh keyed hashes'
		);
		const empty = roundTrip({ map: new Map(), set: new Set(), items: [] }) as {
			map: Map<unknown, unknown>;
			set: Set<unknown>;
			items: unknown[];
		};
		check(
			empty.map.size === 0 && empty.set.size === 0 && empty.items.length === 0,
			'empty collections remain valid'
		);
		const escaped = roundTrip(
			JSON.parse('{"__proto__":{"safe":true},"constructor":"data"}')
		) as Record<string, unknown>;
		check(
			Object.hasOwn(escaped, '__proto__') &&
				Object.getOwnPropertyDescriptor(escaped, 'constructor')?.value === 'data' &&
				Object.getPrototypeOf(escaped) === Object.prototype,
			'object property copying preserves data without changing prototypes'
		);
		const explicit = api.decodeReactiveProtocolValue({
			$exact: 'map',
			version: 1,
			entries: [['a', undefined]]
		}) as Map<string, unknown>;
		check(
			explicit.has('a') && explicit.get('a') === undefined,
			'present undefined values differ from missing slots'
		);
		const shared = { value: 1 };
		check(
			JSON.stringify(roundTrip({ left: shared, right: shared })) ===
				'{"left":{"value":1},"right":{"value":1}}',
			'shared siblings are valid'
		);
		const cycle: { self?: unknown } = {};
		cycle.self = cycle;
		for (const operation of [api.encodeReactiveProtocolValue, api.decodeReactiveProtocolValue]) {
			let rejected = false;
			try {
				operation(cycle);
			} catch (error) {
				rejected = error instanceof TypeError && /cyclic/.test(error.message);
			}
			check(rejected, 'ancestor cycles are rejected');
		}
	} finally {
		release();
	}
}
