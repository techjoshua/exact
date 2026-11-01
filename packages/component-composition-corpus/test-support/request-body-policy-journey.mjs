/** Checks default size diagnostics and explicit caps across request body representations. */
export async function verifyRequestBodyPolicy(api) {
	const check = (condition, message) => {
		if (!condition) throw new Error(message);
	};
	const encoded = JSON.stringify({
		type: 'invoke',
		id: 'save',
		payload: { text: 'x'.repeat(4 * 1024 * 1024) }
	});
	const bytes = new TextEncoder().encode(encoded);
	for (const maximum of [undefined, 1024, bytes.length]) {
		for (const body of [encoded, bytes, JSON.parse(encoded), undefined]) {
			const warnings = [];
			const logger = {
				log(event) {
					if (event.scope.category === 'request-size') warnings.push(event);
				}
			};
			const context = {
				contract: {
					version: 1,
					invocations: { save: api.defineExactOperationContract('save') },
					executors: {},
					boundaries: {}
				},
				invocations: { save: () => ({ patches: [] }) },
				payloadDecoders: { invocations: { save: (value) => value } },
				limits: { maxRequestBytes: maximum },
				logger
			};
			const response = await api.handleExactRequest(
				{
					method: 'POST',
					headers: { 'content-length': String(bytes.length) },
					body,
					bodyStream:
						body === undefined
							? new ReadableStream({
									start(controller) {
										controller.enqueue(bytes);
										controller.close();
									}
								})
							: undefined
				},
				context
			);
			check(
				response.status === (maximum === 1024 ? 400 : 200),
				'request body cap is application-owned'
			);
			check(
				warnings.length === (maximum === undefined ? 1 : 0),
				'one default warning without rejecting valid input'
			);
		}
		for (const streamed of [false, true]) {
			const warnings = [];
			let failure;
			let output;
			try {
				output = await api.readGatewayBody(
					streamed
						? {
								bodyStream: new ReadableStream({
									start(controller) {
										controller.enqueue(bytes);
										controller.close();
									}
								})
							}
						: { body: encoded },
					maximum,
					{
						log(event) {
							warnings.push(event);
						}
					}
				);
			} catch (error) {
				failure = error;
			}
			check(
				maximum === 1024
					? failure instanceof RangeError
					: !failure && output.length === (streamed ? bytes.length : encoded.length),
				'gateway uses the same application byte policy'
			);
			check(
				warnings.length === (maximum === undefined ? 1 : 0),
				'gateway warns once at the default threshold'
			);
		}
	}
	return true;
}

/** Sends single and batched client envelopes through real server dispatch under matching size policies. */
export async function verifyClientRequestBodyPolicy({
	invokeExact,
	invokeExactBatch,
	handleExactRequest,
	defineExactOperationContract
}) {
	const check = (condition, message) => {
		if (!condition) throw new Error('Client request policy: ' + message);
	};
	const operation = { type: 'invoke', id: 'save', payload: { text: 'é'.repeat(2 * 1024 * 1024) } };
	for (const batch of [false, true]) {
		const envelope = batch ? { type: 'batch', version: 1, operations: [operation] } : operation;
		const bytes = new TextEncoder().encode(JSON.stringify(envelope)).byteLength;
		for (const maximum of [undefined, 1024, bytes]) {
			const clientWarnings = [];
			const serverWarnings = [];
			let sent = 0;
			let executed = 0;
			const logger = (warnings) => ({
				log(event) {
					if (event.scope.category === 'request-size') warnings.push(event);
				}
			});
			const context = {
				contract: {
					version: 1,
					invocations: { save: defineExactOperationContract('save') },
					executors: {},
					boundaries: {}
				},
				invocations: {
					save: (input) => {
						executed++;
						check(input.payload.text === operation.payload.text, 'lossless payload');
						return { patches: [] };
					}
				},
				payloadDecoders: { invocations: { save: (value) => value } },
				limits: { maxRequestBytes: maximum },
				logger: logger(serverWarnings)
			};
			const options = {
				endpoint: '/__exact',
				streamLimits: { maxRequestBytes: maximum },
				logger: logger(clientWarnings),
				async fetch(_url, init) {
					sent++;
					const response = await handleExactRequest(
						{ method: init.method, headers: init.headers, body: init.body },
						context
					);
					return new Response(response.body, {
						status: response.status,
						headers: response.headers
					});
				}
			};
			let failure;
			try {
				if (batch) await invokeExactBatch({ ...options, operations: [operation] });
				else await invokeExact({ ...options, ...operation });
			} catch (error) {
				failure = error;
			}
			if (maximum === 1024) {
				check(
					failure?.message === 'eXact request exceeded maxRequestBytes' &&
						sent === 0 &&
						executed === 0,
					'explicit client cap rejects before fetch'
				);
			} else {
				if (failure) throw failure;
				check(sent === 1 && executed === 1, 'single and batched requests reach real dispatch');
			}
			const warnings = maximum === undefined ? 1 : 0;
			check(
				clientWarnings.length === warnings && serverWarnings.length === warnings,
				'default diagnostics and explicit limits agree across the boundary'
			);
		}
	}
	return true;
}
