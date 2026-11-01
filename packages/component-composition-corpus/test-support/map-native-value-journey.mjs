/** Native Map values retain reference identity across assignment and task publication. */
export const mapNativeValueCases = [
	'direct',
	'compiled',
	'rollback',
	'pending-commit',
	'pending-discard',
	'same-reference',
	'reactive-reference',
	'reactive-alias',
	'nan',
	'signed-zero',
	'getter',
	'subclass'
];
/** Checks the value actually retained by native storage, its subscriber, and inverse ownership. */
export function verifyMapNativeValue(api, mode) {
	let reads = 0;
	const make = () =>
		mode === 'getter'
			? Object.defineProperty({}, 'v', {
					enumerable: true,
					get() {
						reads++;
						return 1;
					}
				})
			: { v: 1 };
	const before =
		mode === 'nan'
			? NaN
			: mode === 'signed-zero'
				? -0
				: mode.startsWith('reactive-')
					? api.reactive(make())
					: make();
	const next =
		mode === 'nan'
			? NaN
			: mode === 'signed-zero'
				? 0
				: mode === 'reactive-alias'
					? api.reactive(api.unwrap(before), { onMutation() {} })
					: mode === 'same-reference' || mode === 'reactive-reference'
						? before
						: make();
	class Values extends Map {
		replace(key, value) {
			super.set(key, value);
			return this;
		}
	}
	const map = api.reactive(
		mode === 'subclass' ? new Values([['a', before]]) : new Map([['a', before]])
	);
	let seen, first, pending;
	let calls = 0;
	const stop = api.watch(() => {
		seen = api.unwrap(map.get('a'));
		calls++;
	});
	try {
		if (mode.startsWith('pending')) {
			const root = { map };
			pending = api.createPendingReactiveTransaction(root);
			const view = pending.view(root);
			view.map.set('a', next);
			if (api.unwrap(view.map.get('a')) !== next)
				throw new Error('Pending Map replacement lost native reference');
			if (api.unwrap(map.get('a')) !== before)
				throw new Error('Pending Map published before settlement');
			pending[mode === 'pending-commit' ? 'commit' : 'discard']();
		} else {
			const write = () =>
				mode === 'compiled'
					? api.mutateReactiveCollection({ map }, ['map'], 'map', 'set', ['a', next])
					: mode === 'subclass'
						? map.replace('a', next)
						: map.set('a', next);
			if (mode === 'rollback') first = api.captureReactiveMutations(write);
			else write();
		}
		api.flushSync();
		const expected = api.unwrap(mode === 'pending-discard' ? before : next);
		if (!Object.is(api.unwrap(map.get('a')), expected) || !Object.is(seen, expected))
			throw new Error('Map retained a structurally equal old value: ' + mode);
		if (
			['same-reference', 'reactive-reference', 'reactive-alias', 'nan'].includes(mode) &&
			calls !== 1
		)
			throw new Error('An unchanged Map value notified its subscriber');
		if (reads !== 0) throw new Error('Map assignment read value getters');
		first?.rollback();
		api.flushSync();
		if (first && !Object.is(api.unwrap(map.get('a')), before))
			throw new Error('Map rollback lost original reference');
		return true;
	} finally {
		stop();
		first?.discard();
		pending?.discard();
	}
}
