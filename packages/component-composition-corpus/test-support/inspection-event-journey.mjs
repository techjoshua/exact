/** Checks independent event data, ordered replay, and reentrant client delivery. */
export function verifyClientEventOwnership({ createExactClientEventStore }) {
	const store = createExactClientEventStore(10, 100000);
	const event = {
		protocol: 1,
		cursor: '1',
		sequence: 1,
		timestamp: 1,
		kind: 'state.change',
		id: {
			sessionId: 'session',
			side: 'client',
			buildKey: 'a'.repeat(40),
			executionRoot: 'page',
			componentTypeId: 'component:Page'
		},
		attributes: { count: 1 }
	};
	try {
		const first = [],
			second = [];
		store.subscribe(undefined, undefined, (value) => {
			first.push(value.sequence);
			value.attributes.count = 2;
			value.sequence = 99;
			if (first.length === 1) store.publish(event);
		});
		store.subscribe(undefined, undefined, (value) => second.push(value.sequence));
		store.publish(event);
		event.attributes.count = 3;
		if (
			first.join() !== '1,2' ||
			second.join() !== '1,2' ||
			store.query()[0].attributes.count !== 1
		)
			throw new Error('Client event publication ownership and order');
		const values = store.query();
		values[0].attributes.count = 4;
		values.length = 0;
		if (store.query()[0].attributes.count !== 1) throw new Error('Client event query ownership');
		const replay = [];
		store.subscribe(undefined, undefined, (value) => {
			replay.push(value.sequence);
			if (value.sequence === 1) store.publish(event);
		});
		if (replay.join() !== '1,2,3') throw new Error('Client reentrant event replay');
		store.clear();
		store.publish(event);
		store.publish(event);
		const retired = [];
		store.subscribe(undefined, undefined, (value) => {
			retired.push(value.sequence);
			store.clear();
		});
		if (retired.join() !== '1') throw new Error('Client cleared replay fence');
		return true;
	} finally {
		store.clear();
	}
}

/** Checks request-owned event capture and ordinary drained values through the public server API. */
export async function verifyServerEventOwnership({ createExactServerDebugRuntime }) {
	const runtime = createExactServerDebugRuntime({
		contract: { version: 1, endpoint: '/__exact', invocations: {}, executors: {}, boundaries: {} },
		allowDebug: true
	});
	let observations;
	try {
		const request = {
			method: 'POST',
			url: 'https://app.test/__exact',
			headers: { origin: 'https://app.test' }
		};
		const response = await runtime.handle(request, {
			type: 'debug',
			version: 1,
			request: 'open',
			capabilities: ['events']
		});
		const { session } = JSON.parse(String(response.body));
		observations = await runtime.createRequestRuntime(request, session.id);
		if (!observations) throw new Error('Server event observation authority');
		const attributes = { count: 1 };
		const input = {
			kind: 'state.change',
			buildKey: 'a'.repeat(40),
			executionRoot: 'page',
			componentTypeId: 'component:Page',
			attributes
		};
		observations.observe(input);
		attributes.count = 2;
		const values = observations.drain();
		if (values[0]?.attributes.count !== 1) throw new Error('Server event input capture');
		values[0].sequence = 99;
		values[0].attributes.count = 3;
		values.length = 0;
		if (observations.drain().length !== 0) throw new Error('Server event drained history');
		const event = {
			protocol: 1,
			cursor: '1',
			sequence: 1,
			timestamp: 1,
			kind: 'state.change',
			id: {
				sessionId: session.id,
				side: 'server',
				buildKey: input.buildKey,
				executionRoot: 'page',
				componentTypeId: input.componentTypeId
			},
			attributes: { count: 1 }
		};
		observations.publish(event);
		event.attributes.count = 2;
		if (observations.drain()[0]?.attributes.count !== 1)
			throw new Error('Server runtime event capture');
		const nested = {
			...input,
			toJSON() {
				observations.observe(input);
				return input;
			}
		};
		observations.observe(nested);
		const ordered = observations.drain();
		if (ordered.length !== 2 || ordered[1].sequence !== ordered[0].sequence + 1)
			throw new Error('Server reentrant capture sequence');
		const retired = {
			...input,
			toJSON() {
				observations.dispose();
				return input;
			}
		};
		observations.observe(retired);
		observations.observe(input);
		if (observations.drain().length) throw new Error('Server disposed event owner');
		return true;
	} finally {
		observations?.dispose();
		await runtime.close();
	}
}
