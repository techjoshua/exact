/** Exercises request collector retirement and inherited identity capture through the public server runtime. */
export async function verifyServerRequestInspectionLifetime({
	createExactServerDebugRuntime,
	defineExactOperationContract,
	handleExactRequest
}) {
	const event = {
		kind: 'state.change',
		buildKey: 'a'.repeat(40),
		executionRoot: 'page',
		componentTypeId: 'component:Page',
		attributes: { count: 1 }
	};
	class OwnerOptions {
		get buildKey() {
			return event.buildKey;
		}
		get executionRoot() {
			return event.executionRoot;
		}
		get binding() {
			return 'application-binding';
		}
	}
	for (const retire of [
		'session',
		'runtime',
		'abort',
		'expiry',
		'capture-observe',
		'capture-publish',
		'capture-owner'
	]) {
		const originalNow = Date.now;
		let now = originalNow();
		if (retire === 'expiry') Date.now = () => now;
		const controller = new AbortController();
		const request = { ...inspectionRequest(), signal: controller.signal };
		const runtime = createExactServerDebugRuntime({
			...serverContext(defineExactOperationContract),
			debugLimits: { maxSessionMinutes: 1 }
		});
		let observations;
		try {
			const sessionId = await open(runtime, request);
			observations = await runtime.createRequestRuntime(request, sessionId);
			const owner = observations.inspectionOwner(new OwnerOptions());
			if (
				owner.buildKey !== event.buildKey ||
				owner.executionRoot !== event.executionRoot ||
				owner.binding !== 'application-binding'
			)
				throw new Error('Inherited request owner identity capture');
			observations.observe(event);
			if (observations.drain().length !== 1 || !owner.attached)
				throw new Error('Active observation control');
			let replaced = 0;
			owner.detach = () => {
				replaced++;
			};
			if (retire === 'session')
				await runtime.handle(request, { type: 'debug', version: 1, request: 'close', sessionId });
			else if (retire === 'runtime') await runtime.close();
			else if (retire === 'abort') controller.abort('inspection retired');
			else if (retire === 'expiry') now += 120001;
			let closing;
			if (retire === 'capture-owner') {
				const candidate = observations.inspectionOwner({
					get buildKey() {
						closing = runtime.close();
						return event.buildKey;
					},
					executionRoot: event.executionRoot
				});
				if (candidate.attached) throw new Error('Revoked owner construction published attachment');
			}
			if (retire === 'capture-publish') {
				const envelope = {
					protocol: 1,
					cursor: '1',
					sequence: 1,
					timestamp: 1,
					kind: event.kind,
					id: {
						sessionId,
						side: 'server',
						buildKey: event.buildKey,
						executionRoot: event.executionRoot,
						componentTypeId: event.componentTypeId
					}
				};
				observations.publish({
					...envelope,
					toJSON() {
						closing = runtime.close();
						return envelope;
					}
				});
			} else
				observations.observe(
					retire === 'capture-observe'
						? {
								...event,
								toJSON() {
									closing = runtime.close();
									return event;
								}
							}
						: event
				);
			await closing;
			if (observations.drain().length || owner.attached || replaced)
				throw new Error('Retired inspection leaked output or ownership');
			if (observations.inspectionOwner(new OwnerOptions()).attached)
				throw new Error('Retired inspection attached a new owner');
			observations.dispose();
			let rejected = false;
			try {
				observations.inspectionOwner(new OwnerOptions());
			} catch {
				rejected = true;
			}
			if (!rejected) throw new Error('Disposed collector accepted owner creation');
		} finally {
			Date.now = originalNow;
			observations?.dispose();
			await runtime.close();
		}
	}
	for (const retire of ['session', 'runtime']) {
		let finish, announce;
		const gate = new Promise((resolve) => {
			finish = resolve;
		});
		const started = new Promise((resolve) => {
			announce = resolve;
		});
		const context = serverContext(defineExactOperationContract);
		const runtime = (context.debugRuntime = createExactServerDebugRuntime(context));
		context.invocations = {
			action: async (_input, scoped) => {
				scoped.requestDebugRuntime.observe(event);
				announce();
				await gate;
				scoped.requestDebugRuntime.observe(event);
				return { value: 42 };
			}
		};
		const request = inspectionRequest();
		let pending;
		try {
			const sessionId = await open(runtime, request);
			pending = handleExactRequest(
				{
					...request,
					headers: { ...request.headers, 'x-exact-debug-session': sessionId },
					body: { type: 'invoke', id: 'action' }
				},
				context
			);
			await Promise.race([
				started,
				pending.then(() => {
					throw new Error('Business operation did not start');
				})
			]);
			if (retire === 'session')
				await runtime.handle(request, { type: 'debug', version: 1, request: 'close', sessionId });
			else await runtime.close();
			finish();
			const response = await pending;
			const body = JSON.parse(response.body);
			if (response.status !== 200 || body.value !== 42 || body.__exactObservations !== undefined)
				throw new Error('Debug retirement changed business work or published stale observations');
		} finally {
			finish();
			await pending?.catch(() => {});
			await runtime.close();
		}
	}
	return true;
}

/** Checks complete newest-suffix delivery, UTF-8 sizing and safe invalid-limit fallback. */
export async function verifyServerObservationByteBounds({
	createExactServerDebugRuntime,
	defineExactOperationContract,
	handleExactRequest
}) {
	for (const maximum of [128, 512, 800, 1200, 0.5, NaN, Infinity]) {
		const context = serverContext(defineExactOperationContract);
		context.limits = { maxResponseBytes: maximum };
		const runtime = (context.debugRuntime = createExactServerDebugRuntime(context));
		let captured = [];
		const create = runtime.createRequestRuntime;
		runtime.createRequestRuntime = async (...args) => {
			const collector = await Reflect.apply(create, runtime, args);
			const drain = collector.drain;
			collector.drain = () => {
				captured = Reflect.apply(drain, collector, []);
				return captured;
			};
			return collector;
		};
		context.invocations = {
			action(_input, scoped) {
				for (let count = 0; count < 5; count++)
					scoped.requestDebugRuntime.observe({
						kind: 'state.change',
						buildKey: 'a'.repeat(40),
						executionRoot: 'page',
						componentTypeId: 'component:Page',
						attributes: { count, text: '😀'.repeat(30) }
					});
				return { value: { __exactObservations: 'ordinary application data' } };
			}
		};
		const request = inspectionRequest();
		const previous = Object.getOwnPropertyDescriptor(Object.prototype, '__exactObservations');
		let setters = 0;
		try {
			const sessionId = await open(runtime, request);
			Object.defineProperty(Object.prototype, '__exactObservations', {
				configurable: true,
				set() {
					setters++;
				}
			});
			const response = await handleExactRequest(
				{
					...request,
					headers: { ...request.headers, 'x-exact-debug-session': sessionId },
					body: { type: 'invoke', id: 'action' }
				},
				context
			);
			const body = JSON.parse(response.body);
			const actual = body.__exactObservations ?? [];
			delete body.__exactObservations;
			if (
				response.status !== 200 ||
				body.value.__exactObservations !== 'ordinary application data' ||
				setters
			)
				throw new Error(
					'Observation projection changed application data or invoked a prototype setter'
				);
			const limit = Number.isSafeInteger(maximum) && maximum > 0 ? maximum : 16 * 1024 * 1024;
			let expected = [];
			for (let start = 0; start < captured.length; start++) {
				const candidate = captured.slice(start);
				if (
					new TextEncoder().encode(JSON.stringify({ ...body, __exactObservations: candidate }))
						.byteLength <= limit
				) {
					expected = candidate;
					break;
				}
			}
			if (
				!captured.length ||
				JSON.stringify(actual) !== JSON.stringify(expected) ||
				new TextEncoder().encode(response.body).byteLength > limit
			)
				throw new Error('Observation suffix or final UTF-8 response bound');
		} finally {
			Reflect.deleteProperty(Object.prototype, '__exactObservations');
			if (previous) Object.defineProperty(Object.prototype, '__exactObservations', previous);
			await runtime.close();
		}
	}
	return true;
}

/** Supplies one finite operation and an explicit opt-in inspection policy. */
function serverContext(defineExactOperationContract) {
	return {
		contract: {
			version: 1,
			invocations: { action: defineExactOperationContract('action') },
			executors: {},
			boundaries: {}
		},
		allowDebug: true,
		logger: { isEnabled: () => false, log() {} }
	};
}

/** Uses an absolute same-origin request so every host exercises the same authority checks. */
function inspectionRequest() {
	return {
		method: 'POST',
		url: 'https://app.test/__exact',
		headers: { origin: 'https://app.test' }
	};
}

/** Opens an actual authorized event session rather than replacing the authorization service. */
async function open(runtime, request) {
	const response = await runtime.handle(request, {
		type: 'debug',
		version: 1,
		request: 'open',
		capabilities: ['events']
	});
	if (response.status !== 200) throw new Error('Inspection session control');
	return JSON.parse(response.body).session.id;
}
