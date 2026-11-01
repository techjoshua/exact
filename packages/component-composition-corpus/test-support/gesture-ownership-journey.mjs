/** Exercises ordinary gesture values while preserving detached pointer state and input validation. */
export function verifyGestureValues({
	defineGesture,
	defineDrag,
	createPointerGestureSample,
	createIdleGestureSample,
	resolveKeyboardGestureIntent,
	defaultGestureSettings
}) {
	const check = (value, message) => {
		if (!value) throw new Error('Gesture values: ' + message);
	};
	let thresholdReads = 0;
	const captured = defineDrag({
		get threshold() {
			return ++thresholdReads === 1 ? 5 : NaN;
		}
	});
	check(thresholdReads === 1 && captured.threshold === 5, 'one captured recognizer value');
	let semanticsReads = 0;
	const capturedDefinition = defineGesture({
		get semantics() {
			semanticsReads++;
			return semanticsReads === 1 ? 'decorative' : 'invalid';
		}
	});
	check(
		semanticsReads === 1 && capturedDefinition.semantics === 'decorative',
		'one captured definition discriminant'
	);
	let inheritedReads = 0;
	const onMove = () => undefined;
	const inheritedInput = Object.create({
		get semantics() {
			inheritedReads++;
			check(this === inheritedInput, 'inherited getter receiver');
			return 'decorative';
		},
		drag: Object.create({ threshold: 5, onMove })
	});
	const inherited = defineGesture(inheritedInput);
	check(
		inheritedReads === 1 && inherited.drag.threshold === 5 && inherited.drag.onMove === onMove,
		'declared inherited fields retain normal receivers and values'
	);
	let inheritedRejected = false;
	try {
		defineDrag(Object.create({ threshold: -1 }));
	} catch {
		inheritedRejected = true;
	}
	check(inheritedRejected, 'invalid inherited threshold remains rejected');
	const drag = defineDrag({ threshold: 5 });
	const definition = defineGesture({ semantics: 'decorative', drag });
	drag.threshold = 9;
	check(definition.drag.threshold === 5, 'prepared recognizer snapshot');
	definition.drag.threshold = 7;
	definition.name = 'changed';
	check(definition.drag.threshold === 7 && definition.name === 'changed', 'ordinary aliases');
	const point = { x: 12, y: 8 };
	const pointer = { origin: { x: 0, y: 0 }, last: point, time: 0, pointerType: 'mouse' };
	let reads = 0;
	const sample = createPointerGestureSample({
		phase: 'move',
		point,
		pointer,
		event: new Event('pointermove'),
		startedAt: 0,
		now: () => {
			reads++;
			return 16;
		},
		signal: new AbortController().signal
	});
	sample.point.x = 300;
	point.y = 20;
	check(
		sample.point.y === 8 && pointer.last.x === 12 && pointer.last.y === 20,
		'pointer observation isolation'
	);
	check(
		reads === 1 && sample.elapsed === 16 && sample.velocity.x === 0,
		'one timestamp per sample'
	);
	const idle = createIdleGestureSample('start', new Event('focusin'));
	idle.point.x = 9;
	idle.delta.x = 10;
	check(idle.localPoint.x === 0 && idle.velocity.x === 0, 'independent zero coordinates');
	const intent = resolveKeyboardGestureIntent(
		{ definition: defineGesture({ semantics: 'control', keyboard: { onMove() {} } }) },
		{ key: 'ArrowRight' }
	);
	intent.sample.delta.x = 30;
	check(
		intent.sample.delta.x === 30 && intent.sample.point.x === 0,
		'ordinary keyboard observations'
	);
	const threshold = defaultGestureSettings.dragThreshold;
	try {
		defaultGestureSettings.dragThreshold = 8;
		check(defaultGestureSettings.dragThreshold === 8, 'ordinary settings alias');
	} finally {
		defaultGestureSettings.dragThreshold = threshold;
	}
	for (const input of [{ threshold: NaN }, { threshold: -1 }]) {
		let rejected = false;
		try {
			defineDrag(input);
		} catch {
			rejected = true;
		}
		check(rejected, 'invalid recognizer remains rejected');
	}
	return true;
}

/** Runs clock leases and mutable gesture observations through an actual DOM-owned session. */
export async function verifyGestureSessionOwnership({
	GestureSession,
	defineGesture,
	installGestureClock,
	defaultGestureSettings
}) {
	const check = (value, message) => {
		if (!value) throw new Error('Gesture session: ' + message);
	};
	const element = document.createElement('div');
	document.body.append(element);
	const reads = { first: 0, second: 0 };
	const releases = [];
	const errors = [];
	const samples = [];
	const session = new GestureSession((error) => errors.push(error));
	const pointer = (type, id, x) =>
		element.dispatchEvent(
			Object.assign(new Event(type), {
				pointerId: id,
				clientX: x,
				clientY: 0,
				pointerType: 'touch'
			})
		);
	const observe = (sample) => {
		samples.push({ phase: sample.phase, delta: sample.delta.x, scale: sample.scale });
		sample.point.x = 900;
		sample.delta.x = 900;
		if ('scale' in sample) sample.scale = 900;
	};
	try {
		const first = installGestureClock({
			now() {
				reads.first++;
				return 0;
			}
		});
		const second = installGestureClock({
			now() {
				reads.second++;
				return 0;
			}
		});
		releases.push(first, second);
		session.configure({
			element,
			presented: true,
			disabled: false,
			settings: defaultGestureSettings
		});
		pointer('pointerdown', 1, 0);
		pointer('pointerup', 1, 0);
		check(reads.second > 0 && reads.first === 0, 'latest installed clock');
		first();
		second();
		reads.first = 0;
		reads.second = 0;
		pointer('pointerdown', 1, 0);
		pointer('pointerup', 1, 0);
		check(reads.first === 0 && reads.second === 0, 'disposed clock is not restored');
		first();
		second();
		const clock = {
			now() {
				reads.first++;
				return 0;
			}
		};
		const sharedFirst = installGestureClock(clock),
			sharedSecond = installGestureClock(clock);
		releases.push(sharedFirst, sharedSecond);
		sharedFirst();
		sharedFirst();
		pointer('pointerdown', 1, 0);
		pointer('pointerup', 1, 0);
		check(reads.first > 0, 'same clock object has distinct leases');
		sharedSecond();
		reads.first = 0;
		const policy = { dragThreshold: 1, pressThreshold: 6 };
		let cancellations = 0;
		let activeSignal;
		const configuration = {
			element,
			presented: true,
			disabled: false,
			settings: {
				enabled: true,
				get dragThreshold() {
					return policy.dragThreshold;
				},
				get pressThreshold() {
					return policy.pressThreshold;
				}
			},
			definition: defineGesture({
				semantics: 'control',
				drag: {
					onStart(sample) {
						activeSignal = sample.signal;
						observe(sample);
					},
					onMove: observe,
					onCancel() {
						cancellations++;
					}
				},
				pinch: { threshold: 0, onStart: observe, onMove: observe },
				hover: { onStart: observe },
				keyboard: { onMove: observe }
			})
		};
		session.configure(configuration);
		pointer('pointerdown', 1, 0);
		pointer('pointermove', 1, 10);
		for (let index = 0; index < 8; index++) await Promise.resolve();
		pointer('pointermove', 1, 20);
		for (let index = 0; index < 8; index++) await Promise.resolve();
		check(
			samples.some((sample) => sample.delta === 10) &&
				samples.some((sample) => sample.delta === 20),
			'callback mutations do not alter pointer geometry'
		);
		for (const key of ['dragThreshold', 'pressThreshold']) {
			const before = cancellations;
			session.configure(configuration);
			check(cancellations === before, 'equal live policy retains the session');
			policy[key]++;
			session.configure(configuration);
			check(
				cancellations === before + 1 && activeSignal.aborted,
				'changed live threshold cancels previous recognition'
			);
			const count = samples.length;
			pointer('pointermove', 1, 50);
			check(samples.length === count, 'cancelled pointer cannot deliver more movement');
			pointer('pointerdown', 1, 0);
			pointer('pointermove', 1, 20);
			for (let index = 0; index < 8; index++) await Promise.resolve();
		}
		pointer('pointerdown', 2, 30);
		pointer('pointermove', 2, 40);
		for (let index = 0; index < 8; index++) await Promise.resolve();
		check(
			samples.some((sample) => sample.scale === 2),
			'ordinary pinch sample and preserved geometry'
		);
		pointer('pointerup', 2, 40);
		pointer('pointerup', 1, 20);
		element.dispatchEvent(new Event('pointerenter'));
		element.dispatchEvent(Object.assign(new Event('keydown'), { key: 'ArrowRight' }));
		for (let index = 0; index < 8; index++) await Promise.resolve();
		check(
			samples.some((sample) => sample.delta === 8) && errors.length === 0,
			'keyboard and hover callbacks permit mutation without reports'
		);
		const count = samples.length;
		session[Symbol.dispose]();
		element.dispatchEvent(new Event('pointerenter'));
		check(samples.length === count, 'disposed target removes listeners');
		return true;
	} finally {
		session[Symbol.dispose]();
		for (const release of releases.reverse()) release();
		element.remove();
	}
}
