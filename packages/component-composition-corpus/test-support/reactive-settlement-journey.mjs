/** Checks independent settlement progress, falsey failures, coalescing and later generations. */
export async function verifySettlementIsolation({ afterReactiveSettlement }) {
	await Promise.resolve();
	await Promise.resolve();
	const original = globalThis.queueMicrotask;
	const jobs = [];
	globalThis.queueMicrotask = (callback) => {
		jobs.push(callback);
	};
	const check = (value, message) => {
		if (!value) throw new Error('Reactive settlement: ' + message);
	};
	try {
		for (const primary of [undefined, new Error('first settlement')]) {
			const seen = [];
			const independent = () => {
				seen.push('independent');
			};
			afterReactiveSettlement(() => {
				seen.push('first');
				afterReactiveSettlement(() => {
					seen.push('next');
				});
				throw primary;
			});
			afterReactiveSettlement(() => {
				seen.push('second');
				throw new Error('later settlement');
			});
			afterReactiveSettlement(independent);
			afterReactiveSettlement(independent);
			check(jobs.length === 1, 'coalesced pending generation');
			let threw = false,
				caught;
			try {
				jobs.shift()();
			} catch (error) {
				threw = true;
				caught = error;
			}
			check(threw && caught === primary, 'exact first failure');
			check(
				seen.join(',') === 'first,second,independent',
				'all current work before later generation'
			);
			check(jobs.length === 1, 'one later generation');
			jobs.shift()();
			check(seen.join(',') === 'first,second,independent,next', 'reentrant work settles afterward');
			afterReactiveSettlement(() => {
				seen.push('subsequent');
			});
			jobs.shift()();
			check(seen.at(-1) === 'subsequent' && jobs.length === 0, 'subsequent progress');
		}
	} finally {
		globalThis.queueMicrotask = original;
		for (const job of jobs) original(job);
	}
	return true;
}
