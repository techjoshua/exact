/** Checks coerced array edits and retained tombstones without depending on host argument limits. */
export function verifyArraySegments(
	{ reactive, batch, captureReactiveMutations },
	count = 140_000
) {
	const check = (condition, message) => {
		if (!condition) throw new Error('Array segment: ' + message);
	};
	const items = reactive(Array.from({ length: count }, (_, index) => index));
	const reason = { reason: 'coerced deletion failed' };
	let coercions = 0;
	let failure;
	try {
		batch(() => {
			items.splice(0, {
				valueOf() {
					coercions++;
					return count;
				}
			});
			throw reason;
		});
	} catch (error) {
		failure = error;
	}
	check(failure === reason, 'rollback replaced the application reason');
	check(coercions === 1, 'rollback repeated authored coercion');
	check(
		items.length === count && items.every((value, index) => value === index),
		'rollback lost removed values'
	);
	const removal = captureReactiveMutations(() => items.splice(0, { valueOf: () => count }));
	removal.rollback();
	check(
		items.length === count && items.at(-1) === count - 1,
		'retained rollback lost removed values'
	);

	for (const inserted of [[], ['new'], ['new', 'newer', 'newest', 'last']]) {
		const sparse = reactive([1, , 3, 4, , 6]);
		const edit = captureReactiveMutations(() =>
			sparse.splice(1, { valueOf: () => 3 }, ...inserted)
		);
		sparse.push(7);
		edit.rollback();
		check(
			sparse.length === 7 &&
				sparse[0] === 1 &&
				sparse[2] === 3 &&
				sparse[3] === 4 &&
				sparse[5] === 6 &&
				sparse[6] === 7,
			'restoration lost a suffix or authoritative append'
		);
		check(!(1 in sparse) && !(4 in sparse), 'restoration filled an original hole');
	}
	const retained = reactive(['a', 'b', ...Array.from({ length: count }, (_, index) => index)]);
	const pending = captureReactiveMutations(() => retained.splice(2, count));
	try {
		retained.reverse();
		check(retained.join(',') === 'b,a', 'reordering lost live entries');
	} finally {
		pending.discard();
	}
	const next = captureReactiveMutations(() => retained.push('next'));
	next.rollback();
	check(retained.join(',') === 'b,a', 'released tombstones affected subsequent work');
}
