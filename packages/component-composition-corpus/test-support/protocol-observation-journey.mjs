/** Keeps concurrent observations with the request that produced them, including batches and cleared history. */
export async function verifyProtocolObservationConcurrency(api, document) {
	for (const stream of [false, true]) {
		for (const batch of [false, true])
			for (const finish of [0, 1]) await runCase(api, document, { stream, batch, finish });
		await runCase(api, document, { stream, batch: true, grouped: true, finish: 0 });
		await runCase(api, document, { stream, batch: false, clear: true, finish: 0 });
	}
	await runCase(api, document, { stream: false, batch: false, finish: 1, edit: true });
}

async function runCase(api, document, mode) {
	const { started, finish, recorder, id, operation, context } = createScenario(api);
	const view = await api.mountClientServerTest({
		server: { html: '' },
		container: document.createElement('main'),
		islands: {},
		protocol: recorder,
		hydrate: {
			allowMarkerless: true,
			endpoint: '/__exact',
			batch: mode.batch,
			stream: mode.stream,
			continuations: { [id]: operation }
		},
		handle: (request) => api.handleExactRequest(request, context)
	});
	const pending = [];
	try {
		pending.push(view.client.invokeTask(id));
		void pending[0].catch(() => undefined);
		if (!mode.grouped) await started[0].promise;
		if (mode.clear) recorder.clear();
		pending.push(view.client.invokeTask(id));
		void pending[1].catch(() => undefined);
		await Promise.all(started.map((item) => item.promise));
		check(
			recorder.exchanges.length === (mode.grouped || mode.clear ? 1 : 2),
			'Unexpected request grouping'
		);
		if (!mode.grouped && !mode.clear)
			check(
				recorder.exchanges[0].rawRequestBody === recorder.exchanges[1].rawRequestBody,
				'The concurrency control must use identical requests'
			);
		if (mode.edit) recorder.exchanges[0].operations[0].id = 'edited observation';
		if (mode.grouped) {
			finish[0].resolve();
			finish[1].resolve();
			await Promise.all(pending);
			check(
				recorder.exchanges[0].clientOperations.length === 2 &&
					recorder.exchanges[0].serverContextAccesses.length === 2,
				'Batched observations lost their common request owner'
			);
		} else {
			for (const index of [mode.finish, 1 - mode.finish]) {
				finish[index].resolve();
				check((await pending[index]).value === index + 1, 'Recording changed the operation result');
				if (mode.clear && index === 0) {
					check(
						recorder.exchanges[0].clientOperations.length === 0 &&
							recorder.exchanges[0].serverContextAccesses.length === 0,
						'A cleared request was attached to a later exchange'
					);
					continue;
				}
				const exchange = recorder.exchanges[mode.clear ? 0 : index];
				check(
					exchange.clientOperations.length === 1 &&
						exchange.clientOperations[0].result.value === index + 1,
					'Client disposition was attached to another request'
				);
				check(
					exchange.serverContextAccesses.length === 1 &&
						exchange.serverContextAccesses[0].token === `request-${index}`,
					'Server context use was attached to another request'
				);
			}
		}
		await view.settle();
	} finally {
		finish.forEach((item) => item.resolve());
		await Promise.allSettled(pending);
		await view.unmount();
	}
}

function check(condition, message) {
	if (!condition) throw new Error(message);
}
/** Every started gate is released by its journey finalizer. */
function deferred() {
	let resolve;
	const promise = new Promise((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

/** Builds isolated gates and a real manual operation for deterministic response ordering. */
function createScenario(api) {
	const started = [deferred(), deferred()];
	const finish = [deferred(), deferred()];
	const recorder = new api.ExactProtocolRecorder();
	const id = 'record-operation';
	const operation = api.defineExactOperationContract(id);
	let dispatched = 0;
	const context = {
		contract: {
			version: 1,
			endpoint: '/__exact',
			invocations: { [id]: operation },
			boundaries: {}
		},
		invocations: {
			async [id](_input, context) {
				const index = dispatched++;
				started[index].resolve();
				await finish[index].promise;
				context.onContextAccess?.({
					operationId: id,
					componentId: operation.componentId,
					token: `request-${index}`,
					scope: 'request'
				});
				return { value: index + 1 };
			}
		},
		onContextAccess: (observation) => recorder.observeServerContextAccess(observation)
	};
	return { started, finish, recorder, id, operation, context };
}

/** Exercises the same local ownership bridge in hosts without DOM globals. */
export async function verifyProtocolObservationTransport(api) {
	for (const stream of [false, true])
		for (const grouped of [false, true]) {
			const { started, finish, recorder, id, context } = createScenario(api);
			const fetch = recorder.wrap(
				api.createClientServerTransport((request) => api.handleExactRequest(request, context))
			);
			const operations = [
				{ type: 'invoke', id },
				{ type: 'invoke', id }
			];
			const onResponse = operations.map((operation) => api.linkExactObservationOwner(operation));
			const report = (operation, result) =>
				recorder.observeClientOperation({
					operation,
					result,
					appliedPatches: [],
					patchesApplied: true,
					stale: false
				});
			const pending = [];
			try {
				if (grouped) {
					const result = api.invokeExactBatch({
						endpoint: '/__exact',
						operations,
						fetch,
						stream,
						onResponse: (metadata) => onResponse.forEach((notify) => notify(metadata))
					});
					pending.push(result);
					void result.catch(() => undefined);
					await Promise.all(started.map((item) => item.promise));
					finish.forEach((item) => item.resolve());
					(await result).forEach((item, index) => report(operations[index], item));
					check(
						recorder.exchanges.length === 1 &&
							recorder.exchanges[0].clientOperations.length === 2 &&
							recorder.exchanges[0].serverContextAccesses.length === 2,
						'Native batch observation ownership was lost'
					);
				} else {
					for (let index = 0; index < 2; index++) {
						const request = api
							.invokeExact({
								...operations[index],
								endpoint: '/__exact',
								fetch,
								stream,
								onResponse: onResponse[index]
							})
							.then((result) => {
								report(operations[index], result);
								return result;
							});
						pending.push(request);
						void request.catch(() => undefined);
					}
					await Promise.all(started.map((item) => item.promise));
					for (const index of [0, 1]) {
						finish[index].resolve();
						check(
							(await pending[index]).value === index + 1,
							'Native recording changed an operation result'
						);
						const exchange = recorder.exchanges[index];
						check(
							exchange.clientOperations.length === 1 &&
								exchange.serverContextAccesses[0]?.token === `request-${index}`,
							'Native observations selected another request'
						);
					}
				}
			} finally {
				finish.forEach((item) => item.resolve());
				await Promise.allSettled(pending);
				await recorder.settle();
			}
		}
}
