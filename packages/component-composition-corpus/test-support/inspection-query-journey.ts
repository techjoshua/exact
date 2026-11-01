type InspectionQueryApi = Pick<
	typeof import('@exactjs/devtools-protocol'),
	| 'parseExactInspectionRequest'
	| 'parseExactInspectionSubscription'
	| 'parseExactInspectionResponse'
	| 'parseExactDebugRequest'
	| 'readExactInspectionRequestId'
	| 'paginateExactInspection'
>;

/** Checks read-only parsing, detached transport data and exact graph budgets across inspection consumers. */
export function verifyInspectionQueryData(api: InspectionQueryApi): void {
	const check = (valid: boolean, message: string) => {
		if (!valid) throw new Error('Inspection query data: ' + message);
	};
	const reject = (operation: () => unknown) => {
		let rejected = false;
		try {
			operation();
		} catch {
			rejected = true;
		}
		check(rejected, 'invalid input must be rejected');
	};
	const request = {
		protocol: 1,
		id: 'safe',
		method: 'roots.list',
		params: { filter: { kinds: ['task'] } }
	};
	const cases: Array<[(value: unknown) => unknown, Record<string, unknown>, string]> = [
		[api.parseExactInspectionRequest, request, 'id'],
		[api.parseExactInspectionSubscription, { protocol: 1, sessionId: 'safe' }, 'sessionId'],
		[
			api.parseExactInspectionResponse,
			{ protocol: 1, id: 'safe', ok: true, identity: { sessionId: 'safe' }, result: {} },
			'result'
		],
		[api.parseExactDebugRequest, { type: 'debug', version: 1, request: 'open' }, 'request']
	];
	for (const [parse, base, key] of cases) {
		check(!!parse(base), 'ordinary input accepted');
		for (const enumerable of [true, false]) {
			let reads = 0;
			const input = Object.defineProperty({ ...base }, key, {
				enumerable,
				get() {
					reads++;
					return base[key];
				}
			});
			reject(() => parse(input));
			check(reads === 0, 'accessor never executes');
		}
		reject(() => parse(Object.assign(Object.create({ [key]: base[key] }), base)));
	}
	const parsed = api.parseExactInspectionRequest(request);
	request.params.filter.kinds[0] = 'changed';
	check(
		parsed.params?.filter?.kinds?.[0] === 'task',
		'dispatch owns a detached validated snapshot'
	);
	let reads = 0;
	const accessor = Object.defineProperty({}, 'id', {
		get() {
			reads++;
			throw new Error('authored getter');
		}
	});
	check(
		api.readExactInspectionRequestId(accessor) === 'invalid-request' && reads === 0,
		'failure ID extraction never invokes getters'
	);
	const revoked = Proxy.revocable({}, {});
	revoked.revoke();
	check(
		api.readExactInspectionRequestId(revoked.proxy) === 'invalid-request',
		'revoked failure input is bounded'
	);
	check(api.readExactInspectionRequestId({ id: 'safe' }) === 'safe', 'valid own ID preserved');
	check(
		api.readExactInspectionRequestId(Object.create({ id: 'inherited' })) === 'invalid-request',
		'inherited ID rejected'
	);
	check(
		api.readExactInspectionRequestId({ id: 'x'.repeat(257) }) === 'invalid-request',
		'failure ID remains bounded'
	);
	const response = (result: unknown) => ({
		protocol: 1,
		id: 'safe',
		ok: true,
		identity: { sessionId: 'safe' },
		result
	});
	const sparse = Array(1);
	reject(() => api.parseExactInspectionResponse(response(sparse)));
	const indexed = Object.defineProperty([], 0, {
		get() {
			reads++;
			return 'unsafe';
		}
	});
	reject(() => api.parseExactInspectionResponse(response(indexed)));
	check(reads === 0, 'array cell getter never executes');
	let iterated = 0;
	const custom = ['safe'];
	Object.defineProperty(custom, Symbol.iterator, {
		value() {
			iterated++;
			throw new Error('iterator');
		}
	});
	check(
		JSON.stringify(
			(api.parseExactInspectionResponse(response(custom)) as { result: unknown }).result
		) === '["safe"]' && iterated === 0,
		'custom iterator cannot run'
	);
	const shared = { label: 'shared' };
	const transported = api.parseExactInspectionResponse(response({ left: shared, right: shared }));
	check(transported.ok, 'shared siblings accepted');
	const cycle: Record<string, unknown> = {};
	cycle.self = cycle;
	reject(() => api.parseExactInspectionResponse(response(cycle), { maxDepth: 4 }));
	for (const invalid of [() => {}, Symbol('value'), 1n, NaN, Infinity, new Date()])
		reject(() => api.parseExactInspectionResponse(response(invalid)));
	const dangerous = JSON.parse('{"__proto__":{"safe":true},"constructor":"data"}');
	const restored = api.parseExactInspectionResponse(response(dangerous));
	check(
		restored.ok &&
			Object.hasOwn(restored.result as object, '__proto__') &&
			!Object.hasOwn(Object.prototype, 'safe'),
		'dangerous property names remain data'
	);
	const minimal = { protocol: 1, id: 'safe', method: 'roots.list' };
	api.parseExactInspectionRequest(minimal, { maxNodes: 4, maxDepth: 1 });
	reject(() => api.parseExactInspectionRequest(minimal, { maxNodes: 3 }));
	reject(() => api.parseExactInspectionRequest(minimal, { maxDepth: 0 }));
	reject(() => api.parseExactInspectionRequest(minimal, { maxNodes: NaN }));
	reject(() => api.parseExactInspectionRequest(minimal, { maxDepth: Infinity }));
	reject(() => api.parseExactInspectionRequest(minimal, { maxDepth: -1 }));
	reject(() => api.parseExactInspectionRequest(minimal, { maxNodes: 0 }));
	reject(() => api.parseExactInspectionResponse(response(Array(1_000_000)), { maxNodes: 10 }));
	for (const maximum of [0, -1, NaN, Infinity, 0.5])
		reject(() => api.paginateExactInspection([1, 2], undefined, maximum));
	const first = api.paginateExactInspection([1, 2], undefined, 1);
	const last = api.paginateExactInspection([1, 2], { cursor: first.nextCursor }, 1);
	check(
		first.values[0] === 1 && last.values[0] === 2 && last.nextCursor === undefined,
		'bounded pagination progresses to completion'
	);
}
