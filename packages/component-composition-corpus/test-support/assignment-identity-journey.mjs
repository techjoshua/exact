/** Representative writers and value shapes reused at source and installed package boundaries. */
export const assignmentIdentityCases = [
	{ indexed: false, entry: 'compiler', array: false, equal: true },
	{ indexed: true, entry: 'compiler', array: true, equal: false },
	{ indexed: false, entry: 'native', array: true, equal: true },
	{ indexed: true, entry: 'ref', array: false, equal: false }
];

/** Checks replacement storage, old aliases, subscription migration, and normalized same-storage writes. */
export function verifyAssignmentIdentity(api, { indexed, entry, array, equal }) {
	const check = (condition, message) => {
		if (!condition) throw new Error('Assignment identity: ' + message);
	};
	const make = (value) => (array ? [{ value }] : { value });
	const initial = make(1);
	const rhs = make(equal ? 1 : 2);
	const plain = { item: initial };
	plain.item = rhs;
	const state = indexed ? api.indexedReactive(['item']) : api.reactive({ item: initial });
	state.item = initial;
	const old = state.item;
	const read = (value) => (array ? value[0].value : value.value);
	const mutate = (value, next) => {
		if (array) value[0].value = next;
		else value.value = next;
	};
	const seen = [];
	const stop = api.watch(() => seen.push(read(state.item)));
	try {
		const normalized = api.reactive(rhs);
		if (entry === 'native') state.item = normalized;
		else if (entry === 'ref') api.ref(old).set(normalized);
		else
			check(
				(indexed
					? api.writeIndexedReactiveValue(state, 0, normalized)
					: api.writeReactive(state, ['item'], normalized)) === normalized,
				'authored RHS result'
			);
		api.flushSync();
		check(api.unwrap(state.item) === plain.item, 'normalized RHS storage');
		check(read(old) === 1, 'old alias changed');
		check(JSON.stringify(seen) === JSON.stringify([1, equal ? 1 : 2]), 'replacement notification');
		mutate(state.item, 3);
		api.flushSync();
		mutate(old, 4);
		api.flushSync();
		check(read(state.item) === 3, 'detached old mutation changed replacement');
		check(JSON.stringify(seen) === JSON.stringify([1, equal ? 1 : 2, 3]), 'subscription migration');
		state.item = api.reactive(rhs);
		api.flushSync();
		check(seen.length === 3, 'same-storage write notified');
	} finally {
		stop();
	}
}
