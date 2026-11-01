/** Checks prepared motion aliases while retaining detached static inputs and timing validation. */
export function verifyMotionValues({
	defineMotion,
	resolveMotionEffect,
	createViewTransitionCoordinator,
	defaultMotionSettings,
	createWebAnimationDriver
}) {
	const check = (value, message) => {
		if (!value) throw new Error('Motion ownership: ' + message);
	};
	let durationReads = 0;
	const captured = defineMotion({
		enter: {
			keyframes: [{ opacity: 0 }],
			options: {
				get duration() {
					return ++durationReads <= 2 ? 120 : NaN;
				}
			}
		}
	});
	check(
		durationReads === 1 && captured.enter.options.duration === 120,
		'one captured static timing value'
	);
	let invalidReads = 0;
	let invalidRejected = false;
	try {
		defineMotion({
			enter: {
				keyframes: [{ opacity: 0 }],
				options: {
					get duration() {
						return ++invalidReads === 1 ? NaN : 120;
					}
				}
			}
		});
	} catch {
		invalidRejected = true;
	}
	check(
		invalidRejected && invalidReads === 1,
		'invalid captured timing cannot be replaced by a later getter read'
	);
	const source = { keyframes: [{ opacity: 0 }, { opacity: 1 }], options: { duration: 120 } };
	const definition = defineMotion({ enter: source });
	const prepared = definition.enter;
	prepared.options.duration = 240;
	prepared.keyframes[0].opacity = 0.5;
	prepared.keyframes.push({ opacity: 0.8 });
	check(
		source.options.duration === 120 &&
			source.keyframes.length === 2 &&
			source.keyframes[0].opacity === 0,
		'static input remains independent'
	);
	definition.enter = { keyframes: [{ opacity: 1 }] };
	check(definition.enter !== prepared, 'ordinary definition alias');
	for (const handle of [createWebAnimationDriver(), createViewTransitionCoordinator()]) {
		const method = 'play' in handle ? 'play' : 'publish';
		const original = handle[method];
		handle[method] = (...args) => original.apply(handle, args);
		check(handle[method] !== original, 'writable handle methods');
	}
	const duration = defaultMotionSettings.transition.duration;
	try {
		defaultMotionSettings.transition.duration = 90;
		check(defaultMotionSettings.transition.duration === 90, 'shallow readonly transition');
	} finally {
		defaultMotionSettings.transition.duration = duration;
	}
	const settings = { enabled: true, reducedMotion: 'never', transition: {}, appear: false };
	const negative = defineMotion({
		leave: { keyframes: [{ opacity: 0 }], options: { delay: -60, duration: 120 } }
	});
	check(
		resolveMotionEffect(negative.leave, {}, 'leave', settings).options.delay === -60,
		'finite negative delay'
	);
	for (const options of [
		{ duration: NaN },
		{ delay: Infinity },
		{ duration: -1 },
		{ iterations: Infinity },
		{ iterationStart: -1 }
	]) {
		let rejected = false;
		try {
			resolveMotionEffect({ keyframes: [{ opacity: 0 }], options }, {}, 'leave', settings);
		} catch {
			rejected = true;
		}
		check(rejected, 'invalid structural timing remains rejected');
	}
	return true;
}

/** Checks cancellation before placement, stale frame delivery, and subsequent browser-driver progress. */
export async function verifyMotionPlacement({ createWebAnimationDriver, animate }) {
	const check = (value, message) => {
		if (!value) throw new Error('Motion placement: ' + message);
	};
	const names = ['requestAnimationFrame', 'cancelAnimationFrame'];
	const descriptors = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
	let deliver;
	let cancelled;
	Object.defineProperty(globalThis, names[0], {
		configurable: true,
		writable: true,
		value: (callback) => {
			deliver = callback;
			return 17;
		}
	});
	Object.defineProperty(globalThis, names[1], {
		configurable: true,
		writable: true,
		value: (id) => {
			cancelled = id;
		}
	});
	try {
		for (const reason of [null, false, 0, 'owner-disposed']) {
			cancelled = undefined;
			let animations = 0;
			let cleanups = 0;
			const element = {
				animate() {
					animations++;
					return {
						finished: Promise.resolve(),
						cancel() {
							cleanups++;
						}
					};
				}
			};
			const driver = createWebAnimationDriver();
			const owner = new AbortController();
			let settled = false;
			let failure;
			const playback = driver
				.play(element, { keyframes: [{ opacity: 0 }] }, owner.signal)
				.catch((error) => {
					settled = true;
					failure = error;
				});
			owner.abort(reason);
			for (let index = 0; index < 8; index++) await Promise.resolve();
			check(
				settled && failure === reason && cancelled === 17,
				'owner abort settles without a frame'
			);
			deliver(0);
			await playback;
			check(animations === 0, 'stale frame starts no animation');
			const nextOwner = new AbortController();
			const next = driver.play(element, { keyframes: [{ opacity: 1 }] }, nextOwner.signal);
			deliver(1);
			await next;
			check(animations === 1 && cleanups === 1, 'next playback completes and cleans up');
			cancelled = undefined;
			nextOwner.abort('after-completion');
			check(
				cancelled === undefined && cleanups === 1,
				'completed playback releases cancellation listeners'
			);
		}
		const options = { duration: 120 };
		let playedDuration;
		const playback = animate(
			{
				animate(_frames, timing) {
					playedDuration = timing.duration;
					return { finished: Promise.resolve(), cancel() {} };
				}
			},
			{ keyframes: [{ opacity: 0 }], options }
		);
		options.duration = Infinity;
		deliver(2);
		await playback;
		check(playedDuration === 120, 'imperative playback retains validated timing through placement');

		return true;
	} finally {
		names.forEach((name, index) => {
			const descriptor = descriptors[index];
			if (descriptor) Object.defineProperty(globalThis, name, descriptor);
			else delete globalThis[name];
		});
	}
}
