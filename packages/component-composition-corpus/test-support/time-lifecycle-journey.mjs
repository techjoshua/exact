/** Checks stale callbacks, replacement ownership, reentrant setup, retry and sample capture. */
export async function verifyTimeLifecycle({ createTimeActivation, inspectTimeClock }) {
	const plan = { protocol: 1, kind: 'continuous' };
	const settle = async () => {
		await Promise.resolve();
		await Promise.resolve();
	};
	let reads = 0,
		timer = () => {},
		wake = () => {};
	const clock = {
		now() {
			reads++;
			return { epochMilliseconds: 0 };
		},
		schedule(_, notify) {
			timer = notify;
			return () => {};
		},
		subscribeWake(notify) {
			wake = notify;
			return () => {};
		}
	};
	const first = createTimeActivation('second', plan, clock);
	first.mount(clock);
	await settle();
	const oldTimer = timer,
		oldWake = wake;
	first.dispose();
	await settle();
	const before = reads;
	oldTimer();
	oldWake();
	check(reads === before, 'disposed callbacks');
	const replacement = createTimeActivation('second', plan, clock);
	try {
		replacement.mount(clock);
		await settle();
		const after = reads;
		oldTimer();
		oldWake();
		check(reads === after, 'replacement callbacks');
	} finally {
		replacement.dispose();
		await settle();
	}
	let cancelled = 0,
		activation;
	const reentrant = {
		now: () => ({ epochMilliseconds: 0 }),
		schedule: () => () => {},
		subscribeWake() {
			activation.dispose();
			return () => cancelled++;
		}
	};
	activation = createTimeActivation('second', plan, reentrant);
	activation.mount(reentrant);
	await settle();
	check(
		cancelled === 1 && inspectTimeClock(reentrant).disabledRegistrations === 0,
		'late subscription cleanup'
	);
	let fail = true;
	const retry = {
		now: () => ({ epochMilliseconds: 0 }),
		schedule: () => () => {},
		subscribeWake() {
			if (fail) throw Error('subscribe');
			return () => {};
		}
	};
	const retryActivation = createTimeActivation('second', plan, retry);
	try {
		let rejected = false;
		try {
			retryActivation.mount(retry);
		} catch (error) {
			rejected = error?.message === 'subscribe';
		}
		check(rejected, 'subscription failure');
		fail = false;
		retryActivation.mount(retry);
		await settle();
		check(inspectTimeClock(retry).activeRegistrations === 1, 'subscription retry');
	} finally {
		retryActivation.dispose();
		await settle();
	}
	let epoch = 0,
		samples = 0,
		fire = () => {};
	const sampled = {
		now: () => ({
			get epochMilliseconds() {
				samples++;
				return epoch;
			}
		}),
		schedule(_, notify) {
			fire = notify;
			return () => {};
		}
	};
	const a = createTimeActivation('second', plan, sampled),
		b = createTimeActivation('second', plan, sampled);
	try {
		a.mount(sampled);
		b.mount(sampled);
		await settle();
		samples = 0;
		epoch = 1000;
		fire();
		check(
			samples === 1 && a.readEpochMilliseconds() === 1000 && b.readEpochMilliseconds() === 1000,
			'one selected timestamp'
		);
	} finally {
		a.dispose();
		b.dispose();
		await settle();
	}
	const original = { now: () => ({ epochMilliseconds: 0 }), schedule: () => () => {} };
	let failTransfer = true;
	const transferred = {
		...original,
		subscribeWake() {
			if (failTransfer) throw Error('transfer');
			return () => {};
		}
	};
	const moving = createTimeActivation('second', plan, original);
	try {
		moving.mount(original);
		await settle();
		let rejected = false;
		try {
			moving.configureEnvironment(transferred);
		} catch (error) {
			rejected = error?.message === 'transfer';
		}
		check(rejected, 'clock transfer failure');
		failTransfer = false;
		moving.mount(transferred);
		await settle();
		check(
			inspectTimeClock(transferred).activeRegistrations === 1 &&
				inspectTimeClock(original).activeRegistrations === 0,
			'clock transfer retry'
		);
	} finally {
		moving.dispose();
		await settle();
	}

	return true;
}
function check(condition, contract) {
	if (!condition) throw Error(`Time lifecycle contract failed: ${contract}`);
}

/** Checks captured plan getters, writable observations and finite future deadline progress. */
export function verifyTimeValues({
	createTimeActivation,
	validateTimeChangePlan,
	timeInstant,
	wallTimeClock,
	createManualTimeClock
}) {
	const plan = {
		protocol: 1,
		kind: 'quantized',
		quantumMilliseconds: 1000,
		anchorMilliseconds: 0,
		boundary: 'floor-increasing'
	};
	let reads = 0;
	const captured = validateTimeChangePlan({
		...plan,
		get boundary() {
			return ++reads === 1 ? 'floor-increasing' : 'unsupported';
		}
	});
	check(reads === 1 && captured.boundary === 'floor-increasing', 'captured boundary');
	reads = 0;
	const binding = validateTimeChangePlan({
		...plan,
		anchorMilliseconds: {
			get binding() {
				return ++reads === 1 ? 0 : 999;
			}
		}
	});
	check(reads === 1 && binding.anchorMilliseconds.binding === 0, 'captured binding');
	const instant = timeInstant(0);
	instant.epochMilliseconds = 1;
	check(instant.epochMilliseconds === 1, 'ordinary instant');
	const first = wallTimeClock.now(),
		second = wallTimeClock.now(),
		epoch = second.epochMilliseconds;
	first.epochMilliseconds = 0;
	check(
		second.epochMilliseconds === epoch && wallTimeClock.now().epochMilliseconds === epoch,
		'independent wall observations'
	);
	const activation = createTimeActivation('auto', plan, [0]);
	try {
		activation.plan.quantumMilliseconds = 1;
		activation.inputs[0] = Infinity;
		check(
			activation.plan.quantumMilliseconds === 1000 && activation.inputs[0] === 0,
			'private plan and inputs'
		);
	} finally {
		activation.dispose();
	}
	const clock = createManualTimeClock(1e308),
		large = createTimeActivation('second', { protocol: 1, kind: 'continuous' }, clock);
	large.mount(clock);
	return Promise.resolve().then(() => {
		try {
			check(
				clock.nextDeadline?.epochMilliseconds > 1e308 &&
					Number.isFinite(clock.nextDeadline.epochMilliseconds),
				'future finite deadline'
			);
		} finally {
			large.dispose();
		}
	});
}

/** Checks wake cleanup failure, reentrant retirement, shared publication and the next timer. */
export async function verifyTimeWakeFailures({ createTimeActivation }) {
	const check = (value, message) => {
		if (!value) throw new Error('Time wake: ' + message);
	};
	const settle = async () => {
		await Promise.resolve();
		await Promise.resolve();
	};
	for (const mode of ['normal', 'throw', 'falsey', 'reentrant', 'dispose']) {
		let epoch = 0,
			reads = 0,
			retire = false,
			timer = () => {},
			wake = () => {};
		const primary = mode === 'falsey' ? undefined : new Error('timer cleanup');
		let first;
		const clock = {
			now() {
				reads++;
				return { epochMilliseconds: epoch };
			},
			schedule(_deadline, notify) {
				timer = notify;
				return () => {
					if (!retire) return;
					retire = false;
					if (mode === 'reentrant') notify();
					if (mode === 'dispose') first.dispose();
					if (mode === 'throw' || mode === 'falsey') throw primary;
				};
			},
			subscribeWake(notify) {
				wake = notify;
				return () => {};
			}
		};
		first = createTimeActivation('second', { protocol: 1, kind: 'continuous' }, clock);
		const second = createTimeActivation('second', { protocol: 1, kind: 'continuous' }, clock);
		try {
			first.mount(clock);
			second.mount(clock);
			await settle();
			const old = timer;
			epoch = 2000;
			retire = true;
			let threw = false,
				caught;
			try {
				wake();
			} catch (error) {
				threw = true;
				caught = error;
			}
			check(
				threw === (mode === 'throw' || mode === 'falsey') && (!threw || caught === primary),
				'exact cleanup failure'
			);
			check(
				second.readEpochMilliseconds() === 2000 &&
					first.readEpochMilliseconds() === (mode === 'dispose' ? 0 : 2000),
				'independent shared publication'
			);
			const before = reads;
			old();
			check(reads === before, 'retired callback is fenced');
			await settle();
			epoch = 3000;
			timer();
			await settle();
			check(second.readEpochMilliseconds() === 3000, 'next timer still progresses');
		} finally {
			first.dispose();
			second.dispose();
			await settle();
		}
	}
	return true;
}

/** Checks timer retirement during policy changes and failures while reconciling a clock. */
export async function verifyTimeTimerRetirement({ createTimeActivation }) {
	const check = (value, message) => {
		if (!value) throw new Error('Time timer ownership: ' + message);
	};
	await Promise.resolve();
	await Promise.resolve();
	for (const mode of [
		'minute',
		'disabled',
		'cancel-fails',
		'cancel-reenters',
		'schedule-disposes'
	]) {
		const original = globalThis.queueMicrotask;
		const jobs = [];
		let epoch = 0,
			reads = 0,
			retire = false,
			staleReads = 0,
			returnedCancel = 0,
			timer = () => {};
		const primary = new Error('reconcile cancellation');
		let activation;
		const clock = {
			now() {
				reads++;
				return { epochMilliseconds: epoch };
			},
			schedule(_deadline, notify) {
				timer = notify;
				if (retire && mode === 'schedule-disposes') {
					retire = false;
					activation.dispose();
					return () => {
						returnedCancel++;
					};
				}
				return () => {
					if (!retire || mode === 'schedule-disposes') return;
					retire = false;
					if (mode === 'cancel-reenters') {
						const before = reads;
						notify();
						staleReads = reads - before;
					}
					if (mode === 'cancel-fails') throw primary;
				};
			}
		};
		activation = createTimeActivation('second', { protocol: 1, kind: 'continuous' }, clock);
		try {
			activation.mount(clock);
			await Promise.resolve();
			await Promise.resolve();
			const old = timer;
			globalThis.queueMicrotask = (callback) => {
				jobs.push(callback);
			};
			retire = true;
			activation.configure(mode === 'disabled' ? 'disabled' : 'minute');
			check(jobs.length === 1, 'one pending policy reconciliation');
			let threw = false,
				caught;
			try {
				jobs.shift()();
			} catch (error) {
				threw = true;
				caught = error;
			}
			check(
				threw === (mode === 'cancel-fails') && (!threw || caught === primary),
				'original cancellation failure'
			);
			check(staleReads === 0, 'callback invoked by cancellation is fenced');
			const before = reads;
			old();
			check(reads === before, 'old timer remains retired after policy change');
			if (mode === 'schedule-disposes')
				check(returnedCancel === 1, 'late timer resource released immediately');
			else if (mode !== 'disabled') {
				epoch = 60000;
				timer();
				check(activation.readEpochMilliseconds() === 60000, 'replacement timer progresses');
			}
		} finally {
			retire = false;
			activation.dispose();
			globalThis.queueMicrotask = original;
			for (const job of jobs) original(job);
			await Promise.resolve();
			await Promise.resolve();
		}
	}
	return true;
}
