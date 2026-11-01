/** Checks ordinary contract records and writable aliases without changing compiler identity rules. */
export function verifyServerContractValues({
	defineExactOperationContract,
	defineExactBoundaryContract,
	composeExactExecutorContract,
	createExactHydrationConfig
}) {
	const writes = [{ path: 'title', kind: 'write', confidence: 'exact' }];
	const operation = defineExactOperationContract('save', { writes });
	const boundary = defineExactBoundaryContract('page');
	const contract = composeExactExecutorContract([], {
		endpoint: '/original',
		invocations: { save: operation },
		boundaries: { page: boundary }
	});
	if (
		!Reflect.set(operation, 'componentId', 'application:edited') ||
		!Reflect.set(boundary, 'ownerComponentId', 'edited') ||
		!Reflect.set(contract, 'endpoint', '/edited')
	)
		throw new Error('Server contracts reject ordinary record aliases');
	writes.push({ path: 'other', kind: 'write', confidence: 'exact' });
	if (
		operation.stateWrites.length !== 2 ||
		createExactHydrationConfig(contract).endpoint !== '/edited'
	)
		throw new Error('Server contracts lost ordinary nested aliases or configuration reads');
	if (
		defineExactOperationContract('save').componentId !== 'application:save' ||
		defineExactBoundaryContract('page').ownerComponentId !== 'application:page'
	)
		throw new Error('Server contract observations share instance data');
}

/** Keeps prepared authority and executor identity paired across alternating public requests. */
export async function verifyContinuationContractCache({
	handleExactRequest,
	defineExactOperationContract
}) {
	const check = async (contract, expected) => {
		const response = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'invoke', id: 'save', state: {}, payload: { dependencies: [] } }
			},
			{ contract, logger: { isEnabled: () => false, log() {} } }
		);
		if (
			response.status !== 200 ||
			JSON.stringify(JSON.parse(response.body).state) !== JSON.stringify(expected)
		)
			throw new Error('Continuation cache reused a different contract or executor');
	};
	const makeContract = (invocation, executor) => ({
		version: 1,
		invocations: { save: invocation },
		executors: { save: executor },
		boundaries: {}
	});
	const first = defineExactOperationContract('save', {
		writes: [{ path: 'first', kind: 'write', confidence: 'exact' }]
	});
	const second = defineExactOperationContract('save', {
		writes: [{ path: 'second', kind: 'write', confidence: 'exact' }]
	});
	const executor = {
		id: 'save',
		componentId: first.componentId,
		execute(activation) {
			activation.state.first = 'one';
			activation.state.second = 'two';
			return { state: activation.state };
		}
	};
	const contracts = [makeContract(first, executor), makeContract(second, executor)];
	for (const index of [0, 1, 0, 1])
		await check(contracts[index], index === 0 ? { first: 'one' } : { second: 'two' });
	const replacement = {
		...executor,
		execute(activation) {
			activation.state.first = 'replacement';
			return { state: activation.state };
		}
	};
	for (const implementation of [executor, replacement, executor, replacement])
		await check(makeContract(first, implementation), {
			first: implementation === executor ? 'one' : 'replacement'
		});
}

/** Changes observation aliases while real context reads and writes retain their token ownership. */
export async function verifyServerContextValues({
	createContext,
	handleExactRequest,
	defineExactOperationContract
}) {
	const token = createContext('status', { scope: 'request' });
	const initial = { ready: false };
	const observations = [];
	const events = [];
	const invocation = {
		...defineExactOperationContract('save', {
			writes: [{ path: 'ready', kind: 'write', confidence: 'exact' }],
			serverContexts: ['status']
		}),
		serverContextWrites: ['status']
	};
	const executor = {
		id: 'save',
		componentId: invocation.componentId,
		execute(activation, execution) {
			const previous = execution.getContext(token, 'status');
			execution.setContext(token, { ready: !previous.ready }, 'status');
			activation.state.ready = execution.getContext(token, 'status').ready;
			return { state: activation.state };
		}
	};
	const response = await handleExactRequest(
		{
			method: 'POST',
			body: { type: 'invoke', id: 'save', state: {}, payload: { dependencies: [] } }
		},
		{
			contract: {
				version: 1,
				invocations: { save: invocation },
				executors: { save: executor },
				boundaries: {}
			},
			requestContexts: [[token, { value: initial }]],
			requestDebugRuntime: {
				inspectionOwner() {
					throw new Error('Unexpected inspection owner');
				},
				publish() {},
				observe(event) {
					events.push(event);
				},
				drain() {
					return [];
				},
				dispose() {}
			},
			onContextAccess(observation) {
				if (
					!['token', 'componentId', 'operationId'].every((key) =>
						Reflect.set(observation, key, 'edited')
					)
				)
					throw new Error('Context observation rejects an ordinary alias');
				observations.push(observation);
			},
			logger: { isEnabled: () => false, log() {} }
		}
	);
	if (
		response.status !== 200 ||
		JSON.parse(response.body).state.ready !== true ||
		initial.ready ||
		observations.length !== 3 ||
		new Set(observations).size !== 3
	)
		throw new Error('Context observation edits changed execution or request-local ownership');
	const contextEvents = events.filter((event) => event.kind === 'context.access');
	if (
		contextEvents.length !== 3 ||
		contextEvents.some(
			(event) =>
				event.attributes.token !== 'status' ||
				event.componentTypeId !== invocation.componentId ||
				event.operationId !== invocation.id
		)
	)
		throw new Error('Context observation edits changed private inspection identity');
}
