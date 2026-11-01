/** Checks primary failure identity, complete cleanup, diagnostics and subsequent progress for a task owner. */
export async function verifyTaskFailureOwnership(execute) {
	for (const primary of [undefined, null, false, 'failure', Object.freeze(new Error('primary'))]) {
		const order = [];
		const outcome = await execute((task) => {
			task.cleanup(() => order.push('last'));
			task.cleanup(() => {
				order.push('first');
				throw new Error('cleanup');
			});
			throw primary;
		}).then(
			() => ({ rejected: false }),
			(error) => ({ rejected: true, error })
		);
		check(outcome.rejected && outcome.error === primary, 'Cleanup replaced the primary failure');
		check(order.join(',') === 'first,last', 'A cleanup failure skipped another resource');
	}
	const earlier = new Error('earlier');
	const cleanup = new Error('cleanup');
	const primary = Object.assign(new Error('primary'), { suppressed: [earlier] });
	const outcome = await execute((task) => {
		task.cleanup(() => {
			throw cleanup;
		});
		throw primary;
	}).catch((error) => error);
	check(outcome === primary, 'Mutable primary failure changed');
	check(
		primary.suppressed.length === 2 &&
			primary.suppressed[0] === earlier &&
			primary.suppressed[1] === cleanup,
		'Cleanup discarded existing diagnostics'
	);
	let cleaned = false;
	const cleanupOnly = await execute((task) => {
		task.cleanup(() => {
			cleaned = true;
		});
		task.cleanup(() => {
			throw undefined;
		});
	}).then(
		() => ({ rejected: false }),
		(error) => ({ rejected: true, error })
	);
	check(
		cleanupOnly.rejected && cleanupOnly.error === undefined && cleaned,
		'Falsey cleanup failure was lost'
	);
	check(
		(await execute(() => false)) === false,
		'Failure leaked into the next successful execution'
	);
}

/** Keeps settled children independent of a later parent cancellation, while pending parents still reject. */
export async function verifySettledChildCancellation(runTaskFrame) {
	let release;
	const gate = new Promise((resolve) => {
		release = resolve;
	});
	let child;
	const parent = runTaskFrame(
		{ kind: 'parent' },
		{
			work() {
				child = runTaskFrame({ kind: 'child' }, { work: () => 'child' });
				return gate;
			}
		}
	);
	const parentOutcome = parent.catch((error) => error);
	try {
		check((await child) === 'child', 'Child did not settle');
		parent.cancel('parent stopped');
		check(!child.signal.aborted, 'Parent retroactively cancelled its settled child');
		check((await parentOutcome).reason === 'parent stopped', 'Pending parent lost cancellation');
	} finally {
		release();
		await parentOutcome;
	}
	check(
		(await runTaskFrame({ kind: 'next' }, { work: () => 'next' })) === 'next',
		'Cancellation blocked subsequent work'
	);
}

function check(condition, message) {
	if (!condition) throw new Error(message);
}
