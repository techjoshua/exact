/** Checks request-local observation ownership through the real in-memory server/client harness. */
export function verifyProtocolObservationConcurrency(
	api: {
		ExactProtocolRecorder: typeof import('../../testing/src/protocol.js').ExactProtocolRecorder;
		mountClientServerTest: typeof import('../../testing/src/client-server.js').mountClientServerTest;
		handleExactRequest: typeof import('@exactjs/server').handleExactRequest;
		defineExactOperationContract: typeof import('@exactjs/server').defineExactOperationContract;
	},
	document: Document
): Promise<void>;

/** Checks actual transport ownership and native server dispatch without requiring DOM globals. */
export function verifyProtocolObservationTransport(api: {
	ExactProtocolRecorder: typeof import('../../testing/src/protocol.js').ExactProtocolRecorder;
	createClientServerTransport: typeof import('../../testing/src/internal/client-server-transport.js').createClientServerTransport;
	handleExactRequest: typeof import('@exactjs/server').handleExactRequest;
	defineExactOperationContract: typeof import('@exactjs/server').defineExactOperationContract;
	invokeExact: typeof import('../../hydrate/src/invocations.js').invokeExact;
	invokeExactBatch: typeof import('../../hydrate/src/invocations.js').invokeExactBatch;
	linkExactObservationOwner: typeof import('../../core/src/inspection-transport.js').linkExactObservationOwner;
}): Promise<void>;
