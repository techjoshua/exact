/** Checks wide nested atomic writes, retained journals, observer publication and subsequent work. */
export function verifyWideTransactions(
	{ reactive, batch, publishBatch, captureReactiveMutations, watch, flushSync },
	count = 140_000
) {
	const check = (condition, message) => {
		if (!condition) throw new Error('Wide transaction: ' + message);
	};
	const state = reactive({ value: 0 });
	const seen = [];
	const stop = watch(() => seen.push(state.value));
	const write = () => {
		for (let index = 1; index <= count; index++) state.value = index;
	};
	try {
		const reason = { reason: 'outer owner failed' };
		let failure;
		try {
			batch(() => {
				batch(write);
				throw reason;
			});
		} catch (error) {
			failure = error;
		}
		flushSync();
		check(
			failure === reason && state.value === 0,
			'nested rollback lost state or the original reason'
		);
		check(seen.length === 1 && seen[0] === 0, 'failed atomic work reached a reader');
		const journal = captureReactiveMutations(() => batch(write));
		flushSync();
		check(
			state.value === count && seen.at(-1) === count,
			'journal did not publish its committed writes'
		);
		journal.rollback();
		flushSync();
		check(
			state.value === 0 && seen.at(-1) === 0,
			'retained journal did not restore its predecessor'
		);
		const authoritative = captureReactiveMutations(() =>
			batch(() => {
				state.value = 1;
			})
		);
		state.value = 2;
		authoritative.rollback();
		flushSync();
		check(state.value === 2, 'a retained journal replaced a later authoritative write');
		try {
			publishBatch(() => {
				batch(() => {
					state.value = 3;
				});
				throw reason;
			});
		} catch (error) {
			check(error === reason, 'framework publication changed the application reason');
		}
		flushSync();
		check(
			state.value === 3 && seen.at(-1) === 3,
			'ordinary event publication acquired implicit rollback'
		);
		batch(() => {
			state.value = 4;
		});
		flushSync();
		check(state.value === 4 && seen.at(-1) === 4, 'later work was blocked');
	} finally {
		stop();
	}
	const delivered = seen.length;
	state.value = 5;
	flushSync();
	check(seen.length === delivered, 'disposed reader retained a subscription');
}
