/** Representative selected-storage transitions shared by source and native package acceptance. */
export const assignmentPendingCases = [
	{ selection: 'insert', settlement: 'commit' },
	{ selection: 'insert', settlement: 'reject' },
	{ selection: 'property', settlement: 'reject' },
	{ selection: 'map-aba', settlement: 'commit' },
	{ selection: 'map-aba', settlement: 'reject' },
	{ selection: 'set-clear', settlement: 'commit' },
	{ selection: 'detached-set', settlement: 'commit' },
	{ selection: 'insert', settlement: 'discard' }
];

/** Checks raw storage, silent staging, observer migration, real inverses, fencing and disposal separately. */
export function verifyAssignmentPending(api, { selection, settlement }) {
	const check = (condition, message) => {
		if (!condition) throw new Error(`Assignment pending ${selection}/${settlement}: ${message}`);
	};
	const a = { count: 1 },
		b = { count: 2 };
	const property = selection === 'property';
	const set = selection.includes('set');
	const raw = property
		? { child: a }
		: set
			? new Set([a])
			: new Map(selection === 'insert' ? [] : [['x', a]]);
	const root = { raw, wrapped: api.reactive(raw), reject: 0 };
	const seenA = [],
		seenB = [];
	const stopA = api.watch(() => seenA.push(api.reactive(a).count));
	const stopB = api.watch(() => seenB.push(api.reactive(b).count));
	const pending = api.createPendingReactiveTransaction(root);
	let cursor;
	try {
		pending.read(root, 'raw');
		let selectedA, selectedB;
		if (property) selectedA = pending.read(raw, 'child');
		else if (set) {
			cursor = pending.call(raw, 'values', []);
			selectedA = cursor.next().value;
			if (selection === 'detached-set') raw.clear();
			else pending.call(raw, 'clear', []);
		} else {
			if (selection === 'map-aba') selectedA = pending.call(raw, 'get', ['x']);
			pending.call(raw, 'set', ['x', b]);
			selectedB = pending.call(raw, 'get', ['x']);
			if (selection === 'map-aba') pending.call(raw, 'set', ['x', a]);
		}
		// The raw selection precedes acquisition of its reactive parent.
		pending.read(root, 'wrapped');
		if (selectedA) pending.write(selectedA, 'count', 8);
		if (selectedB) pending.write(selectedB, 'count', 9);
		api.flushSync();
		check(a.count === 1 && b.count === 2, 'staging changed raw child storage');
		if (property) check(raw.child === a, 'staging replaced property storage');
		else if (!set)
			check(
				raw.get('x') === (selection === 'insert' ? undefined : a),
				'staging replaced Map storage'
			);
		check(
			JSON.stringify(seenA) === '[1]' && JSON.stringify(seenB) === '[2]',
			'staging notified observers'
		);
		if (!property)
			check(
				raw.size === (selection === 'insert' || selection === 'detached-set' ? 0 : 1),
				'staging changed native membership'
			);
		if (settlement === 'reject') {
			pending.write(root, 'reject', 1);
			Object.defineProperty(root, 'reject', {
				configurable: true,
				set() {
					throw new Error('owned rejection');
				}
			});
			let failure;
			try {
				pending.commit();
			} catch (error) {
				failure = error;
			}
			check(failure?.message === 'owned rejection', 'publication lost later native failure');
		} else if (settlement === 'discard') pending.discard();
		else pending.commit();
		api.flushSync();
		const committed = settlement === 'commit';
		check(a.count === (committed && selectedA ? 8 : 1), 'selected A inverse/value');
		check(b.count === (committed && selectedB ? 9 : 2), 'selected B inverse/value');
		check(
			JSON.stringify(seenA) ===
				JSON.stringify(committed && selectedA && selection !== 'detached-set' ? [1, 8] : [1]),
			'selected A notifications'
		);
		check(
			JSON.stringify(seenB) === JSON.stringify(committed && selectedB ? [2, 9] : [2]),
			'selected B notifications'
		);
		if (property) check(raw.child === a, 'property storage identity');
		else if (set) check(raw.size === 0, 'cleared membership');
		else
			check(
				raw.get('x') === (selection === 'map-aba' ? a : committed ? b : undefined),
				'Map membership inverse/identity'
			);
		if (cursor) {
			let fenced = false;
			try {
				cursor.next();
			} catch {
				fenced = true;
			}
			check(fenced, 'closed iterator remained live');
		}
		let fenced = false;
		try {
			pending.write(selectedA ?? selectedB, 'count', 50);
		} catch {
			fenced = true;
		}
		check(fenced, 'closed generation accepted a write');
		const next = api.createPendingReactiveTransaction(root.wrapped);
		try {
			next.write(root.wrapped, 'after', 3);
			next.commit();
			check(raw.after === 3, 'next publication failed');
		} finally {
			next.discard();
		}
		stopA();
		stopB();
		const counts = [seenA.length, seenB.length];
		api.reactive(a).count = 20;
		api.reactive(b).count = 21;
		api.flushSync();
		check(seenA.length === counts[0] && seenB.length === counts[1], 'disposed observers still ran');
	} finally {
		pending.discard();
		stopA();
		stopB();
	}
}
