/** Public server runtime facade. */
export { exactResponseHeaders } from './response/headers.js';
export {
	createExpressHandler,
	createFetchHandler,
	createHapiHandler,
	exactResponseToFetchResponse,
	handleExactFetchRequest,
	createAdapterLifetime,
	cleanupAdapterPreservingPrimary,
	withAdapterStreamCleanup,
	type ExactDisconnectSource,
	type ExactExpressNext,
	type ExactExpressRequest,
	type ExactExpressResponse,
	type ExactHapiRequest,
	type ExactHapiResponse,
	type ExactHapiToolkit
} from './adapters.js';
export {
	applyResponseState,
	createExactContextRuntime,
	openExactRequestScope,
	runWithExactRequestScope
} from './context.js';
export { unsafeExactHtml, type ExactTrustedHtml } from './trusted-html.js';
export {
	createExactBufferedResponse,
	createExactAsyncProducedResponse,
	createExactProducedResponse,
	exactResponseBodyOf,
	type ExactResponseBody,
	type ExactResponseBodyOperations,
	type ExactResponseStreamOptions,
	type ExactBufferedResponseBody,
	type ExactProducedResponseBody,
	type ExactAsyncProducedResponseBody,
	type ExactAsyncResponseBodyProducer,
	type ExactResponseBodyScopeRelease,
	type ExactResponseBodyWriter,
	type ExactSynchronousResponseEnvironment,
	type ExactSynchronousResponseBodyProducer,
	type ExactResponseWithBody
} from './response/body.js';
export {
	composeExactExecutorContract,
	createExactHydrationConfig,
	defineExactBoundaryContract,
	defineExactOperationContract
} from './executor-contract.js';
export {
	continuationDependencies,
	createExactContinuationHandler,
	type ExactGeneratedContinuationHandler
} from './continuation-execution.js';
export { createExactBindingGateway } from './gateway.js';
export {
	createExactInspectionCatalogRegistry,
	type ExactInspectionCatalogRegistration,
	type ExactInspectionCatalogRegistry
} from './debug/catalog-registry.js';
export {
	createExactServerDebugRuntime,
	exactServerDebugRuntime,
	registerExactInspectionCatalog
} from './debug/runtime.js';
export type * from './types.js';
export type * from './payload-decoding.js';
export type * from './remote-build-contracts.js';
export type * from './hydration-types.js';
export { handleExactRequest } from './runtime/request-handler.js';

export { consumeExactResponseBody, cancelExactResponseBody } from './response/consumption.js';
