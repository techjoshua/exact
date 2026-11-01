/** Exercises strict security decisions and context ownership through the public server boundary. */
export async function verifyServerSecurity({
	handleExactRequest,
	defineExactOperationContract,
	createExactServerDebugRuntime,
	createExactContextRuntime,
	openExactRequestScope
}) {
	const invocation = { type: 'invoke', id: 'security-action' };
	const contract = {
		version: 1,
		invocations: { 'security-action': defineExactOperationContract('security-action') },
		executors: {},
		boundaries: {}
	};
	const logger = { isEnabled: () => false, log() {} };
	let dispatched = 0;
	const invocations = {
		'security-action': () => {
			dispatched++;
			return { value: 42 };
		}
	};
	for (const hook of ['authorize', 'validateCsrf', 'authorizeOperation']) {
		for (const allowed of [false, true]) {
			class Configuration {
				contract = contract;
				invocations = invocations;
				logger = logger;
				#allowed = allowed;
				[hook]() {
					return this.#allowed;
				}
			}
			const response = await handleExactRequest(
				{ method: 'POST', body: invocation },
				new Configuration()
			);
			if (response.status !== (allowed ? 200 : 403)) throw new Error(`Inherited ${hook} ownership`);
		}
		for (const decision of [undefined, null, false, 0, 1, 'true', { allowed: false }]) {
			const response = await handleExactRequest(
				{ method: 'POST', body: invocation },
				{
					contract,
					invocations,
					logger,
					[hook]: async () => decision
				}
			);
			if (response.status !== 403) throw new Error(`Malformed ${hook} decision`);
		}
	}
	if (dispatched !== 3) throw new Error('Rejected security policy executed business logic');
	for (const streaming of [false, true]) {
		const response = await handleExactRequest(
			{
				method: 'POST',
				headers: streaming ? { accept: 'application/x-ndjson' } : {},
				body: { type: 'batch', version: 1, operations: [invocation, invocation] }
			},
			{ contract, invocations, logger, authorizeOperation: () => ({ allowed: false }) }
		);
		if (response.status !== 200) throw new Error('Batch response contract');
		if (streaming) {
			const reader = response.stream.getReader();
			try {
				while (!(await reader.read()).done) {
					/* Drain to execute demand-owned operations. */
				}
			} finally {
				reader.releaseLock();
			}
		} else if (!JSON.parse(response.body).results.every((result) => result.ok === false)) {
			throw new Error('Batch authorization result');
		}
	}
	if (dispatched !== 3) throw new Error('Batch or stream bypassed authorization');
	for (const hook of ['authorize', 'validateCsrf']) {
		let forwarded = false;
		const response = await handleExactRequest(
			{
				method: 'POST',
				headers: { 'x-exact-binding': 'remote' },
				body: invocation
			},
			{
				contract,
				logger,
				[hook]: () => ({ allowed: false }),
				gateway: {
					forward() {
						forwarded = true;
						throw new Error('Unauthorized forwarding');
					}
				}
			}
		);
		if (response.status !== 403 || forwarded) throw new Error('Gateway request authorization');
	}
	for (const policy of [true, false, async () => true, async () => ({ allowed: false })]) {
		const runtime = createExactServerDebugRuntime({ contract, logger, allowDebug: policy });
		try {
			const response = await runtime.handle(
				{
					method: 'POST',
					url: 'https://app.test/__exact',
					headers: { origin: 'https://app.test' }
				},
				{ type: 'debug', version: 1, request: 'open' }
			);
			if (
				response.status !==
				(policy === true || (typeof policy === 'function' && (await policy()) === true) ? 200 : 404)
			) {
				throw new Error('Debug authorization decision');
			}
		} finally {
			await runtime.close();
		}
	}
	const runtime = createExactContextRuntime();
	let disposed = 0;
	const open = runtime.open;
	runtime.open = async (...args) => {
		const opened = await Reflect.apply(open, runtime, args);
		return {
			...opened,
			async dispose(reason) {
				disposed++;
				await opened.dispose(reason);
				throw new Error('Secondary cleanup');
			}
		};
	};
	try {
		const configuration = { contract, logger, contextRuntime: runtime };
		Object.defineProperty(configuration, 'failure', {
			enumerable: true,
			get() {
				throw undefined;
			}
		});
		let rejected = false;
		try {
			await openExactRequestScope({ method: 'POST' }, configuration);
		} catch (error) {
			rejected = true;
			if (error !== undefined) throw new Error('Lost primary capture failure');
		}
		if (!rejected || disposed !== 1) throw new Error('Configuration capture resource leak');
	} finally {
		await runtime.dispose();
	}
	return true;
}
