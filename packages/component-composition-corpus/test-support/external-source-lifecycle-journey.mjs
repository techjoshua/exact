/** Checks subscription acquisition and accepted snapshot identity using one coherent reactive provider. */
export function verifyExternalSourceLifecycle(api) {
	for (const selected of [false, true]) {
		const create = selected
			? (options) => api.createSelectedExternalSource({ ...options, selector: (value) => value })
			: api.createExternalSource;
		let snapshot = { value: 1 };
		let notify;
		let released = 0;
		const source = create({
			connect: false,
			getSnapshot: () => snapshot,
			subscribe(callback) {
				notify = callback;
				return () => released++;
			}
		});
		const values = [];
		const stop = api.watch(() => values.push(source.value.get()));
		try {
			source.connect();
			snapshot = { value: 1 };
			notify();
			api.flushSync();
			check(
				source.value.get() === snapshot && values.at(-1) === snapshot,
				'Accepted snapshot identity was lost'
			);
			source.dispose();
			source.dispose();
			check(released === 1 && !source.connected, 'Subscription did not release exactly once');
		} finally {
			stop();
			source.dispose();
		}
		let subscriptions = 0;
		let closes = 0;
		const reentrant = create({
			connect: false,
			getSnapshot: () => 1,
			subscribe() {
				if (++subscriptions === 1) reentrant.connect();
				return () => closes++;
			}
		});
		try {
			reentrant.connect();
			check(subscriptions === 1, 'Reentrant connect acquired duplicate subscriptions');
		} finally {
			reentrant.dispose();
		}
		check(closes === 1, 'Reentrant subscription cleanup was duplicated');
		const scope = api.createEffectScope();
		let lateReleased = 0;
		const late = api.withEffectScope(scope, () =>
			create({
				connect: false,
				getSnapshot: () => 1,
				subscribe() {
					scope.stop();
					return () => lateReleased++;
				}
			})
		);
		late.connect();
		check(
			late.disposed && !late.connected && lateReleased === 1,
			'Setup disposal retained its late subscription'
		);
		let subscribed = false;
		let failing = true;
		let retriesReleased = 0;
		const failure = new Error('snapshot');
		const retry = create({
			connect: false,
			getSnapshot() {
				if (subscribed && failing) throw failure;
				return 1;
			},
			subscribe() {
				subscribed = true;
				return () => retriesReleased++;
			}
		});
		try {
			const outcome = thrown(() => retry.connect());
			check(
				outcome.failed && outcome.error === failure && !retry.connected && retriesReleased === 1,
				'Failed setup retained its subscription'
			);
			failing = false;
			retry.connect();
			check(
				retry.connected && retry.value.get() === 1,
				'Failed setup prevented a subsequent connection'
			);
		} finally {
			retry.dispose();
		}
		check(retriesReleased === 2, 'Retried subscription was not released');
	}
}

function thrown(work) {
	try {
		work();
		return { failed: false };
	} catch (error) {
		return { failed: true, error };
	}
}

function check(condition, message) {
	if (!condition) throw new Error(message);
}
