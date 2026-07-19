import type {
	ExactBatchRequest,
	ExactBatchResult,
	ExactInvocationRequest,
	ExactRequestLike,
	ExactResponseLike,
	ExactServerContext,
	ServerProfileEvent
} from './types.js';
import { jsonResponse, parseExactRequestBody, readBody, requestPayloadSafe } from './protocol.js';
import { dispatchExactBatch, streamExactResponse, wantsStreaming } from './streaming.js';
import { runWithExactRequestScope } from './context.js';
import {
	checkSecurityHooks,
	dispatchExactOperation,
	dispatchSecurityCheckedExactOperation,
	isOperationError,
	limitedJsonResponse,
	logReject,
	matchesConfiguredEndpoint
} from './operations.js';

export { exactCompilerManifestVersion, exactServerManifestVersion } from './versions.js';
export {
	createExactHydrationActionBoundaries,
	createExactHydrationManifestConfig,
	createExactHydrationStateContracts,
	createExactServerManifest
} from './manifest.js';
export {
	createExpressHandler,
	createFetchHandler,
	createHapiHandler,
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
export type * from './types.js';

/** Handles an eXact endpoint request using the runtime-neutral server protocol. */
export async function handleExactRequest(
	request: ExactRequestLike,
	context: ExactServerContext
): Promise<ExactResponseLike> {
	const profileStarted = context.onProfile ? performance.now() : undefined;
	try {
		return await handleExactRequestOwned(request, context);
	} finally {
		if (profileStarted !== undefined) {
			context.onProfile?.(
				Object.freeze({
					subsystem: 'server',
					phase: 'request',
					elapsedMs: performance.now() - profileStarted
				} satisfies ServerProfileEvent)
			);
		}
	}
}

async function handleExactRequestOwned(
	request: ExactRequestLike,
	context: ExactServerContext
): Promise<ExactResponseLike> {
	if (!context.requestContext) {
		return runWithExactRequestScope(
			request,
			context,
			(scoped) => handleExactRequestOwned(request, scoped),
			request.platformRequest ?? request
		);
	}
	if (request.method.toUpperCase() !== 'POST') {
		return jsonResponse(405, { error: 'method_not_allowed' });
	}

	if (!matchesConfiguredEndpoint(request, context.manifest.endpoint)) {
		logReject(context, 'rejected exact invocation for mismatched endpoint');
		return jsonResponse(404, { error: 'not_found' });
	}

	let input: ExactInvocationRequest | ExactBatchRequest;
	try {
		input = parseExactRequestBody(await readBody(request), {
			maxBatchOperations: context.limits?.maxBatchOperations,
			maxJsonDepth: context.limits?.maxJsonDepth,
			maxJsonNodes: context.limits?.maxJsonNodes,
			maxRequestBytes: context.limits?.maxRequestBytes
		});
	} catch {
		logReject(context, 'rejected malformed exact invocation');
		return jsonResponse(400, { error: 'bad_request' });
	}

	if (
		!requestPayloadSafe(input, {
			maxJsonDepth: context.limits?.maxJsonDepth,
			maxJsonNodes: context.limits?.maxJsonNodes,
			maxRequestBytes: context.limits?.maxRequestBytes
		})
	) {
		logReject(context, 'rejected non-serializable exact invocation payload');
		return jsonResponse(400, { error: 'bad_request' });
	}

	// Top-level security hooks reject the entire request before any manifest dispatch.
	// Single operations reuse that result; batches still validate each operation during dispatch.
	const security = await checkSecurityHooks(request, input, context);
	if (security === 'unauthorized') {
		logReject(context, 'rejected unauthorized exact invocation');
		return jsonResponse(403, { error: 'forbidden' });
	}

	if (security === 'csrf') {
		logReject(context, 'rejected exact invocation with invalid csrf');
		return jsonResponse(403, { error: 'forbidden' });
	}

	if (wantsStreaming(request)) {
		return streamExactResponse(
			request,
			input,
			context,
			input.type === 'batch' ? dispatchExactOperation : dispatchSecurityCheckedExactOperation
		);
	}

	if (input.type === 'batch') {
		const results = await dispatchExactBatch(
			request,
			input.operations,
			context,
			dispatchExactOperation
		);
		return limitedJsonResponse(context, 200, {
			ok: true,
			version: 1,
			results
		} satisfies ExactBatchResult);
	}

	const result = await dispatchSecurityCheckedExactOperation(request, input, context);
	if (isOperationError(result)) return jsonResponse(result.status, { error: result.error });
	return limitedJsonResponse(context, 200, result);
}
