/** Checks native option lookup and cancellation before and after compiler signal adaptation. */
export function verifyTaskNativeOptions(api) {
	const check = (value, message) => {
		if (!value) throw new Error('Task native options: ' + message);
	};
	for (const capture of [false, true]) {
		let nativeFailure;
		for (const adapt of [undefined, api.withAbortSignal, api.withExistingAbortSignal]) {
			const owner = new AbortController(),
				external = new AbortController();
			class Options {
				#once;
				signalReads = 0;
				constructor(once) {
					this.#once = once;
				}
				get once() {
					return this.#once;
				}
				get capture() {
					return capture;
				}
				get passive() {
					return false;
				}
				get signal() {
					this.signalReads++;
					return external.signal;
				}
			}
			try {
				const options = new Options(true);
				const selected = adapt ? adapt(options, owner.signal) : options;
				const target = new EventTarget();
				let calls = 0,
					failed = false;
				try {
					target.addEventListener(
						'probe',
						() => {
							calls++;
						},
						selected
					);
				} catch (error) {
					failed = true;
					if (!adapt) nativeFailure = error;
					else
						check(
							nativeFailure && error?.name === nativeFailure.name,
							'native capture rejection preserved'
						);
				}
				if (failed) continue;
				check(!nativeFailure, 'adapter must preserve native rejection');
				target.dispatchEvent(new Event('probe'));
				target.dispatchEvent(new Event('probe'));
				check(
					calls === 1 &&
						selected.capture === capture &&
						selected.passive === false &&
						options.signalReads === 1,
					'inherited once and original getter receiver'
				);
				const cancelOptions = new Options(false);
				const cancelSelected = adapt ? adapt(cancelOptions, owner.signal) : cancelOptions;
				target.addEventListener(
					'canceled',
					() => {
						calls++;
					},
					cancelSelected
				);
				external.abort('external');
				target.dispatchEvent(new Event('canceled'));
				check(calls === 1 && cancelOptions.signalReads === 1, 'explicit listener cancellation');
			} finally {
				owner.abort('owner');
				external.abort('external');
			}
		}
	}
	for (const adapt of [undefined, api.withTaskSignal, api.withExistingTaskSignal]) {
		const owner = new AbortController(),
			external = new AbortController();
		const headers = { 'x-owned': 'initial' };
		class Options {
			#method = 'POST';
			signalReads = 0;
			get method() {
				return this.#method;
			}
			get headers() {
				return headers;
			}
			get signal() {
				this.signalReads++;
				return external.signal;
			}
		}
		const options = new Options();
		const selected = adapt ? adapt(options, owner.signal) : options;
		headers['x-owned'] = 'changed';
		const request = new Request('https://app.test/', selected);
		check(
			request.method === 'POST' &&
				request.headers.get('x-owned') === 'changed' &&
				options.signalReads === 1,
			'native request fields and mutable nested alias'
		);
		external.abort('external');
		owner.abort('owner');
		check(
			request.signal.aborted && request.signal.reason === 'external',
			'first explicit request cancellation'
		);
	}
	for (const adapt of [api.withTaskSignal, api.withExistingTaskSignal]) {
		const owner = new AbortController(),
			external = new AbortController();
		const virtual = new Proxy(
			{ method: 'POST' },
			{
				get(target, key, receiver) {
					return key === 'signal' ? external.signal : Reflect.get(target, key, receiver);
				},
				has(target, key) {
					return key === 'signal' ? false : Reflect.has(target, key);
				}
			}
		);
		const request = new Request('https://app.test/', adapt(virtual, owner.signal));
		external.abort('virtual');
		check(
			request.method === 'POST' && request.signal.aborted && request.signal.reason === 'virtual',
			'native dictionary lookup retains virtual signal fields'
		);
		owner.abort();
	}
	for (const adapt of [undefined, api.withAbortSignal, api.withExistingAbortSignal]) {
		const owner = new AbortController();
		let ignoredReads = 0;
		const options = {
			get unrelated() {
				ignoredReads++;
				throw new Error('not an event option');
			}
		};
		const target = new EventTarget();
		let calls = 0;
		target.addEventListener(
			'probe',
			() => {
				calls++;
			},
			adapt ? adapt(options, owner.signal) : options
		);
		target.dispatchEvent(new Event('probe'));
		owner.abort();
		check(calls === 1 && ignoredReads === 0, 'event dictionaries ignore unrelated getters');
	}
	const owner = new AbortController();
	const managed = new Request(
		'https://app.test/',
		api.withTaskSignal({ method: 'POST' }, owner.signal)
	);
	const cleanup = new Request(
		'https://app.test/',
		api.withExistingTaskSignal({ method: 'POST' }, owner.signal)
	);
	const defaultManaged = new Request(
		'https://app.test/',
		api.withTaskSignal(undefined, owner.signal)
	);
	for (const capture of [true, false, undefined]) {
		const selected = api.withAbortSignal(capture, owner.signal);
		check(
			selected.signal === owner.signal && selected.capture === capture,
			'boolean and omitted managed event options'
		);
	}
	owner.abort('finished');
	check(
		managed.signal.aborted && defaultManaged.signal.aborted && !cleanup.signal.aborted,
		'cleanup does not enroll new work without an authored signal'
	);
	check(
		api.withExistingAbortSignal(true, owner.signal) === true &&
			api.withExistingAbortSignal(undefined, owner.signal) === undefined,
		'native boolean and omitted options'
	);
	return true;
}
