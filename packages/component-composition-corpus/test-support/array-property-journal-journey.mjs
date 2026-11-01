/** Native property writes, compiler writes, and structural controls that share array slot ownership. */
export const arrayPropertyJournalCases = [
	'full-clear-live',
	'full-clear-later',
	'full-clear-zero',
	'full-clear-undefined',
	'full-clear-refusal',
	'delete-moved',
	'delete-compiled',
	'delete-authoritative',
	'delete-blocked',
	'push',
	'splice',
	'index',
	'define',
	'compiled-index',
	'sparse-index',
	'sparse-define',
	'sparse-compiled',
	'length',
	'length-equal-proxy',
	'length-equal-raw',
	'length-equal-other',
	'receiver',
	'blocked-receiver',
	'hole-reuse',
	'hole-reuse-overlap'
];

/** Checks restored values, holes, entry order, and an existing numeric subscriber. */
export function verifyArrayPropertyJournal(api, kind) {
	if (!arrayPropertyJournalCases.includes(kind)) throw new Error('Unknown array journal control');
	if (kind.startsWith('full-clear-')) return verifyFullClearJournal(api, kind);
	const items = api.reactive(['a', 'b']);
	let seen;
	const stop = api.watch(() => {
		seen = items[1] ?? 'missing';
	});
	let first, held, temporary, moved;
	try {
		if (kind.startsWith('delete-')) {
			if (kind === 'delete-blocked') Object.defineProperty(items, '1', { configurable: false });
			first = api.captureReactiveMutations(() => {
				const accepted =
					kind === 'delete-compiled'
						? api.deleteReactiveValue(items, [1])
						: Reflect.deleteProperty(items, '1');
				if (accepted === (kind === 'delete-blocked'))
					throw new Error('Native deletion acceptance changed');
			});
			if (kind !== 'delete-blocked') items.unshift('x');
			if (kind === 'delete-authoritative') items[2] = 'later';
			first.rollback();
			api.flushSync();
			if (kind === 'delete-blocked') assertShape(items, 2, { 0: 'a', 1: 'b' }, kind);
			else
				assertShape(
					items,
					3,
					{ 0: 'x', 1: 'a', 2: kind === 'delete-authoritative' ? 'later' : 'b' },
					kind
				);
			if (seen !== (kind === 'delete-blocked' ? 'b' : 'a'))
				throw new Error('Deleted entry observer restored at old index');
			return true;
		}
		first = api.captureReactiveMutations(() => items.splice(1, 1));
		api.flushSync();
		if (kind.startsWith('hole-reuse')) {
			held = api.captureReactiveMutations(() => {
				items[0] = 'held';
			});
			if (kind === 'hole-reuse-overlap') {
				temporary = api.captureReactiveMutations(() => {
					items[1] = 'temporary';
				});
				temporary.rollback();
			}
			items.length = 5;
			first.rollback();
			moved = api.captureReactiveMutations(() => items.splice(1, 1));
			items.unshift('x');
			moved.rollback();
			held.rollback();
			assertShape(items, 6, { 0: 'x', 1: 'a', 2: 'b' }, kind);
		} else {
			if (kind === 'push') items.push('x');
			if (kind === 'splice') items.splice(items.length, 0, 'x');
			if (kind === 'index' || kind === 'sparse-index')
				items[kind === 'index' ? items.length : 4] = 'x';
			if (kind === 'define' || kind === 'sparse-define')
				Object.defineProperty(items, kind === 'define' ? String(items.length) : '4', {
					value: 'x',
					writable: true,
					enumerable: true,
					configurable: true
				});
			if (kind === 'compiled-index' || kind === 'sparse-compiled')
				api.writeReactiveLazy(items, [kind === 'compiled-index' ? items.length : 4], () => 'x');
			if (kind === 'length') items.length = 5;
			if (kind.startsWith('length-equal')) {
				const receiver =
					kind === 'length-equal-proxy'
						? items
						: kind === 'length-equal-raw'
							? api.unwrap(items)
							: {};
				if (!Reflect.set(items, 'length', items.length, receiver))
					throw new Error('An accepted equal length assignment was rejected');
			}
			if (kind === 'receiver' || kind === 'blocked-receiver') {
				const blocked = kind === 'blocked-receiver';
				const receiver = blocked ? Object.preventExtensions({}) : {};
				let accepted;
				api.batch(() => {
					accepted = Reflect.set(items, '7', 'x', receiver);
				});
				if (accepted === blocked || Object.hasOwn(receiver, '7') === blocked)
					throw new Error('Native receiver acceptance changed');
			}
			first.rollback();
			if (kind.startsWith('sparse')) assertShape(items, 6, { 0: 'a', 1: 'b', 5: 'x' }, kind);
			else if (kind === 'length') assertShape(items, 5, { 0: 'a', 1: 'b' }, kind);
			else if (kind === 'length-equal-other') assertShape(items, 2, { 0: 'a', 1: 'b' }, kind);
			else if (kind.startsWith('length-equal')) assertShape(items, 1, { 0: 'a' }, kind);
			else if (kind.includes('receiver')) assertShape(items, 2, { 0: 'a', 1: 'b' }, kind);
			else assertShape(items, 3, { 0: 'a', 1: 'b', 2: 'x' }, kind);
		}
		api.flushSync();
		const expected = kind.startsWith('hole-reuse')
			? 'a'
			: kind.startsWith('length-equal') && kind !== 'length-equal-other'
				? 'missing'
				: 'b';
		if (seen !== expected)
			throw new Error('Numeric subscriber retained the wrong restored entry: ' + kind);
		return true;
	} finally {
		stop();
		moved?.discard();
		temporary?.discard();
		held?.discard();
		first?.discard();
	}
}

/** Preserves native receiver identity and avoids publishing writes against an unchanged target. */
export function verifyReactiveReceiverOwnership(api) {
	const target = api.reactive({ value: 'original' });
	let calls = 0;
	const stop = api.watch(() => {
		target.value;
		calls++;
	});
	try {
		const receiver = {};
		if (!Reflect.set(target, 'value', 'next', receiver))
			throw new Error('Valid receiver write rejected');
		api.flushSync();
		if (target.value !== 'original' || receiver.value !== 'next' || calls !== 1)
			throw new Error('A receiver-only write was published against the target');
		const value = api.reactive({ nested: 1 });
		Reflect.set(target, 'value', value, receiver);
		if (receiver.value !== value)
			throw new Error('A plain receiver lost its supplied reactive value');
	} finally {
		stop();
	}
	const raw = { value: 'before' };
	const custom = api.reactive(
		new Proxy(raw, {
			set(target, key, value) {
				return Reflect.set(target, key, value, target);
			}
		})
	);
	let seen;
	const stopCustom = api.watch(() => {
		seen = custom.value;
	});
	try {
		Reflect.set(custom, 'value', 'after', {});
		api.flushSync();
		if (seen !== 'after') throw new Error('A wrapped proxy lost its performed target write');
	} finally {
		stopCustom();
	}
	return true;
}

function assertShape(items, length, entries, kind) {
	if (items.length !== length || Object.keys(items).join() !== Object.keys(entries).join())
		throw new Error('Array shape changed during ' + kind);
	for (const [key, value] of Object.entries(entries))
		if (items[key] !== value) throw new Error('Array entry order changed during ' + kind);
}

/** Exercises real descriptor reentry and failure without depending on private position records. */
function verifyFullClearJournal(api, kind) {
	const check = (condition, message) => {
		if (!condition) throw new Error(kind + ': ' + message);
	};
	const shape = (items) => JSON.stringify({ values: Array.from(items), keys: Object.keys(items) });
	const caught = (action) => {
		let didCatch = false;
		let reason;
		try {
			action();
		} catch (error) {
			didCatch = true;
			reason = error;
		}
		return { didCatch, reason };
	};
	const raw = ['A', 'B', 'C-base'];
	let armed = false;
	let fired = false;
	let sameWindow;
	let independent;
	const other = api.reactive({ value: 'base' });
	const fault = kind === 'full-clear-zero' || kind === 'full-clear-undefined';
	const reason = kind === 'full-clear-zero' ? 0 : undefined;
	const wrapped = new Proxy(raw, {
		defineProperty(target, key, descriptor) {
			if (armed && !fired && fault && descriptor.value === 'B') {
				fired = true;
				throw reason;
			}
			if (armed && !fired && kind === 'full-clear-refusal' && descriptor.value === 'A') {
				fired = true;
				items.reverse();
				const accepted = Reflect.defineProperty(target, key, descriptor);
				items.reverse();
				sameWindow = api.captureReactiveMutations(() => {
					items[2] = 'in-window';
				});
				independent = api.captureReactiveMutations(() => {
					other.value = 'new';
					items.push('new-address');
				});
				return accepted;
			}
			const accepted = Reflect.defineProperty(target, key, descriptor);
			if (armed && !fired && kind === 'full-clear-later' && accepted && descriptor.value === 'B') {
				const index = raw.indexOf('C-optimistic');
				check(index >= 0, 'restored semantic member missing');
				fired = true;
				items[index] = 'C-independent';
			}
			return accepted;
		}
	});
	const items = api.reactive(wrapped);
	const observations = [];
	const reports = [];
	const stop = api.watch(() => observations.push(shape(items)), undefined, {
		onError: (error) => reports.push(error)
	});
	let older;
	let clear;
	try {
		older = api.captureReactiveMutations(() => {
			items[2] = 'C-optimistic';
		});
		clear = api.captureReactiveMutations(() => items.splice(0, 3));
		api.flushSync();
		armed = true;
		const result = caught(() => clear.rollback());
		armed = false;
		api.flushSync();
		const actual = shape(items);
		const observed = observations.at(-1);
		const prior = caught(() => older.rollback());
		const shared = caught(() => sameWindow?.rollback());
		const outside = caught(() => independent?.rollback());
		api.flushSync();
		check(result.didCatch === fault, 'restoration caught flag');
		if (fault) check(Object.is(result.reason, reason), 'exact primitive failure');
		check(fired === (kind !== 'full-clear-live'), 'authored boundary reached');
		check(actual === observed, 'observer differs from actual partial storage');
		check(!prior.didCatch && !shared.didCatch && !outside.didCatch, 'predecessor settlement');
		if (kind === 'full-clear-later') check(items[2] === 'C-independent', 'later write overwritten');
		if (kind === 'full-clear-live') check(items[2] === 'C-base', 'normal predecessor restoration');
		if (kind === 'full-clear-refusal') {
			check(items[2] === 'in-window', 'uncertain shared original replayed');
			check(other.value === 'base' && items.length === 3, 'independent authority lost');
		}
		const before = shape(items);
		const next = api.captureReactiveMutations(() => {
			items[2] = 'following';
			items.push('FOLLOW');
		});
		const following = caught(() => next.rollback());
		api.flushSync();
		check(!following.didCatch && shape(items) === before, 'renewed following journal');
		const keep = api.captureReactiveMutations(() => items.push('KEEP'));
		keep.discard();
		check(items.at(-1) === 'KEEP', 'following discard');
		check(reports.length === 0, 'unexpected observer report');
		check(api.unwrap(items) === wrapped, 'receiver identity changed');
		return true;
	} finally {
		armed = false;
		clear?.discard();
		older?.discard();
		sameWindow?.discard();
		independent?.discard();
		stop();
		api.flushSync();
		const count = observations.length;
		items.push('AFTER-STOP');
		api.flushSync();
		check(observations.length === count, 'observer remained live');
	}
}
