/** Verifies application-owned request byte caps using source or installed runtime functions. */
export function verifyRequestBodyPolicy(api: {
	handleExactRequest: typeof import('../../server/src/index.js').handleExactRequest;
	defineExactOperationContract: typeof import('../../server/src/index.js').defineExactOperationContract;
	readGatewayBody: typeof import('../../server/src/gateway/body.js').readGatewayBody;
}): Promise<true>;

/** Executes single and batched client requests against the shared server byte-policy contract. */
export function verifyClientRequestBodyPolicy(api: {
	invokeExact: typeof import('../../hydrate/src/invocations.js').invokeExact;
	invokeExactBatch: typeof import('../../hydrate/src/invocations.js').invokeExactBatch;
	handleExactRequest: typeof import('../../server/src/index.js').handleExactRequest;
	defineExactOperationContract: typeof import('../../server/src/index.js').defineExactOperationContract;
}): Promise<true>;
