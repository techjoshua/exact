/** Collection clear ownership and settlement controls shared by runtime hosts. */
export const collectionClearCases = [
	'plain',
	'unrelated',
	'authoritative',
	'both-first',
	'both-last',
	'two-clears',
	'throw',
	'empty',
	'compiled',
	'subclass'
];
/** Checks per-key ownership, original successor ordering, observation, and continued use. */
export function verifyCollectionClear(api, kind, mode) {
	const keys = [NaN, undefined, 'a', {}, () => undefined];
	let raw;
	if (mode === 'subclass') {
		if (kind === 'Map') {
			class Values extends Map {
				wipe() {
					super.clear();
				}
			}
			raw = new Values(keys.map((key) => [key, key]));
		} else {
			class Values extends Set {
				wipe() {
					super.clear();
				}
			}
			raw = new Values(keys);
		}
	} else raw = kind === 'Map' ? new Map(keys.map((key) => [key, key])) : new Set(keys);
	const value = api.reactive(raw);
	const put = (key) => (kind === 'Map' ? value.set(key, 'later') : value.add(key));
	let seen, first, second;
	const stop = api.watch(() => {
		seen = [...value.keys()];
	});
	const clear = () =>
		mode === 'subclass'
			? value.wipe()
			: mode === 'compiled'
				? api.mutateReactiveCollection(
						{ value },
						['value'],
						kind === 'Map' ? 'map' : 'set',
						'clear',
						[]
					)
				: value.clear();
	try {
		if (mode === 'empty') value.clear();
		if (mode === 'throw') {
			let caught;
			try {
				api.batch(() => {
					clear();
					throw new Error('owned clear failure');
				});
			} catch (error) {
				caught = error;
			}
			if (caught?.message !== 'owned clear failure')
				throw new Error('Clear changed failure identity');
		} else {
			first = api.captureReactiveMutations(clear);
			if (
				mode === 'unrelated' ||
				mode === 'two-clears' ||
				mode === 'compiled' ||
				mode === 'subclass'
			)
				put('new');
			if (mode === 'authoritative') put(NaN);
			if (mode.startsWith('both')) second = api.captureReactiveMutations(() => put(NaN));
			if (mode === 'two-clears') second = api.captureReactiveMutations(() => value.clear());
			if (mode === 'both-last') second.rollback();
			first.rollback();
			if (mode === 'both-first' || mode === 'two-clears') second.rollback();
		}
		api.flushSync();
		const expected =
			mode === 'empty'
				? []
				: ['unrelated', 'compiled', 'subclass'].includes(mode)
					? ['new', ...keys]
					: mode === 'two-clears'
						? [...keys, 'new']
						: keys;
		if (!sameKeys([...value.keys()], expected, api.unwrap) || !sameKeys(seen, expected, api.unwrap))
			throw new Error('Clear lost membership, ordering, or observation: ' + kind + '/' + mode);
		if (mode === 'authoritative' && kind === 'Map' && value.get(NaN) !== 'later')
			throw new Error('Clear overwrote authoritative key');
		put('after');
		api.flushSync();
		if (seen.at(-1) !== 'after') throw new Error('Clear broke the next update');
		return true;
	} finally {
		stop();
		second?.discard();
		first?.discard();
	}
}
function sameKeys(left, right, unwrap) {
	return (
		left.length === right.length &&
		left.every((key, index) => Object.is(unwrap(key), unwrap(right[index])))
	);
}
/** Keyed transport must hash the values that remain after inverse settlement. */
export const hashRollbackCases = [
	'field',
	'push',
	'reverse',
	'length',
	'delete',
	'replace',
	'throw',
	'discard',
	'authoritative',
	'both-first',
	'both-last'
];
/** Checks actual receiving values, not only equality of cached hash fields. */
export function verifyHashRollback(api, mode) {
	const source = api.reactive({
		rows: [
			{ id: 'a', v: 0 },
			{ id: 'b', v: 1 }
		]
	});
	const release = api.registerReactiveListKey(source.rows, (item) => item.id, 'sender', 'id');
	let first, second, releaseReceiver;
	const encode = () => JSON.parse(JSON.stringify(api.encodeReactiveProtocolValue(source.rows)));
	try {
		const mutate = () => {
			if (['field', 'throw', 'discard', 'authoritative', 'both-first', 'both-last'].includes(mode))
				source.rows[0].v = 10;
			if (mode === 'push') source.rows.push({ id: 'c', v: 2 });
			if (mode === 'reverse') source.rows.reverse();
			if (mode === 'length') source.rows.length = 1;
			if (mode === 'delete') delete source.rows[0].v;
			if (mode === 'replace')
				api.writeReactive(
					source,
					['rows'],
					[
						{ id: 'a', v: 10 },
						{ id: 'b', v: 1 }
					]
				);
		};
		let during;
		if (mode === 'throw') {
			try {
				api.batch(() => {
					mutate();
					during = encode();
					throw new Error('owned hash failure');
				});
			} catch (error) {
				if (error.message !== 'owned hash failure') throw error;
			}
		} else {
			first = api.captureReactiveMutations(mutate);
			during = encode();
		}
		const receiver = api.reactive({ rows: api.decodeReactiveProtocolValue(during) });
		releaseReceiver = api.registerReactiveListKey(
			receiver.rows,
			(item) => item.id,
			'receiver',
			'id'
		);
		if (mode === 'authoritative') source.rows[0].v = 20;
		if (mode.startsWith('both'))
			second = api.captureReactiveMutations(() => {
				source.rows[0].v = 20;
			});
		if (mode === 'both-last') {
			second.rollback();
			encode();
		}
		if (mode === 'discard') first.discard();
		else first?.rollback();
		if (mode === 'both-first') second.rollback();
		api.writeReactive(receiver, ['rows'], api.decodeReactiveProtocolValue(encode()));
		if (JSON.stringify(receiver.rows) !== JSON.stringify(source.rows))
			throw new Error('Stale hashes retained rejected receiving values: ' + mode);
		if (source.rows[0].v !== (mode === 'discard' ? 10 : mode === 'authoritative' ? 20 : 0))
			throw new Error('Incorrect source settlement');
		source.rows[0].v = 99;
		api.writeReactive(receiver, ['rows'], api.decodeReactiveProtocolValue(encode()));
		if (receiver.rows[0].v !== 99) throw new Error('Hash invalidation lost the next update');
		return true;
	} finally {
		second?.discard();
		first?.discard();
		releaseReceiver?.();
		release();
	}
}
/** Hash owner identity crosses plain storage, retained reactive aliases, and indexed state. */
export const hashOwnerKinds = ['plain', 'proxy', 'indexed', 'nested-proxy'];
/** Checks native descriptor acceptance and actual receiving updates through retained aliases. */
export function verifyHashOwner(api, kind, operation) {
	let item;
	if (kind === 'indexed') {
		item = api.indexedReactive(['id', 'v']);
		item.id = 'a';
		item.v = 0;
	} else item = kind === 'plain' ? { id: 'a', v: 0 } : api.reactive({ id: 'a', v: 0 });
	const rows = api.reactive(kind === 'nested-proxy' ? [{ id: 'a', child: item }] : [item]);
	const selected = kind === 'plain' ? rows[0] : item;
	if (operation === 'refused')
		Object.defineProperty(selected, 'v', { writable: false, configurable: false });
	const release = api.registerReactiveListKey(rows, (entry) => entry.id, 'owner-hash', 'id');
	let first, releaseReceiver;
	const encode = () => JSON.parse(JSON.stringify(api.encodeReactiveProtocolValue(rows)));
	try {
		const before = encode();
		const receiver = api.reactive({ rows: api.decodeReactiveProtocolValue(before) });
		releaseReceiver = api.registerReactiveListKey(
			receiver.rows,
			(entry) => entry.id,
			'receiver',
			'id'
		);
		if (operation === 'set') selected.v = 1;
		if (operation === 'define') Object.defineProperty(selected, 'v', { value: 1 });
		if (operation === 'delete') Reflect.deleteProperty(selected, 'v');
		if (operation === 'equal') selected.v = 0;
		if (operation === 'refused' && Reflect.set(selected, 'v', 1))
			throw new Error('Refused descriptor write accepted');
		if (operation === 'rollback') {
			first = api.captureReactiveMutations(() => {
				selected.v = 1;
			});
			encode();
			first.rollback();
		}
		const after = encode();
		const changed = ['set', 'define', 'delete'].includes(operation);
		if ((before.itemsHash !== after.itemsHash) !== changed)
			throw new Error('Hashes lost native mutation or inverse: ' + kind + '/' + operation);
		api.writeReactive(receiver, ['rows'], api.decodeReactiveProtocolValue(after));
		const actual = kind === 'nested-proxy' ? receiver.rows[0].child : receiver.rows[0];
		if (actual.v !== selected.v || Object.hasOwn(actual, 'v') !== Object.hasOwn(selected, 'v'))
			throw new Error('Receiver retained stale aliased values');
		return true;
	} finally {
		first?.discard();
		releaseReceiver?.();
		release();
	}
}
