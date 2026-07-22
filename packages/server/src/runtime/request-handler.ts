import { runWithExactRequestScope } from '../context.js';
import {
	checkSecurityHooks,
	dispatchExactOperation,
	dispatchSecurityCheckedExactOperation,
	isOperationError,
	limitedJsonResponse,
	logReject,
	matchesConfiguredEndpoint
} from '../operations.js';
import { jsonResponse, parseExactRequestBody, readBody, requestPayloadSafe } from '../protocol.js';
import { dispatchExactBatch, streamExactResponse, wantsStreaming } from '../streaming.js';
import type {
	ExactBatchRequest,
	ExactBatchResult,
	ExactInvocationRequest,
	ExactRequestLike,
	ExactRemoteBuildRegistration,
	ExactResponseLike,
	ExactServerContext,
	ServerProfileEvent
} from '../types.js';

export {
	createExpressHandler,
	createFetchHandler,
	createHapiHandler,
	type ExactExpressRequest,
	type ExactExpressResponse,
	type ExactHapiRequest,
	type ExactHapiResponse,
	type ExactHapiToolkit
} from '../adapters.js';
export {
	applyResponseState,
	createExactContextRuntime,
	openExactRequestScope,
	runWithExactRequestScope
} from '../context.js';
export {
	createExactHydrationActionBoundaries,
	createExactHydrationManifestConfig,
	createExactHydrationStateContracts,
	createExactServerManifest
} from '../manifest.js';
export { createExactBindingGateway } from '../gateway.js';
export type * from '../types.js';
export { exactCompilerManifestVersion, exactServerManifestVersion } from '../versions.js';

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

	if (requestHeader(request, 'x-exact-binding') !== undefined) {
		if (!context.gateway) {
			logReject(context, 'rejected exact invocation for unknown binding');
			return jsonResponse(404, { error: 'unknown_binding' });
		}
		return context.gateway.forward(request, input, context);
	}

	const build = resolveRemoteBuild(request, context);
	if (build === null) {
		return withBuildHeaders(jsonResponse(410, { error: 'exact_build_unsupported' }), context);
	}
	const responseContext = context;
	const dispatch = build
		? (
				operationRequest: ExactRequestLike,
				operation: ExactInvocationRequest,
				_base: ExactServerContext
			) =>
				dispatchSecurityCheckedExactOperation(
					operationRequest,
					operation,
					contextForRemoteOperation(responseContext, build, operation)
				)
		: dispatchSecurityCheckedExactOperation;

	if (wantsStreaming(request)) {
		return withBuildHeaders(
			await streamExactResponse(
				request,
				input,
				responseContext,
				build ? dispatch : input.type === 'batch' ? dispatchExactOperation : dispatch
			),
			context
		);
	}

	if (input.type === 'batch') {
		const results = await dispatchExactBatch(
			request,
			input.operations,
			responseContext,
			build ? dispatch : dispatchExactOperation
		);
		return withBuildHeaders(
			limitedJsonResponse(responseContext, 200, {
				ok: true,
				version: 1,
				results
			} satisfies ExactBatchResult),
			context
		);
	}

	const result = await dispatch(request, input, responseContext);
	if (isOperationError(result))
		return withBuildHeaders(jsonResponse(result.status, { error: result.error }), context);
	return withBuildHeaders(limitedJsonResponse(responseContext, 200, result), context);
}

function resolveRemoteBuild(
	request: ExactRequestLike,
	context: ExactServerContext
): ExactRemoteBuildRegistration | undefined | null {
	if (!context.remoteBuilds) return undefined;
	const key = requestHeader(request, 'x-exact-build');
	if (!key) return null;
	const registration = context.remoteBuilds[key];
	if (!registration || registration.buildKey !== key) return null;
	return registration;
}

function contextForRemoteOperation(
	context: ExactServerContext,
	build: ExactRemoteBuildRegistration,
	input: ExactInvocationRequest
): ExactServerContext {
	const root = input.root ? build.roots[input.root] : undefined;
	if (!root) {
		return { ...context, manifest: emptyManifest(context), actions: {}, refreshBoundaries: {} };
	}
	return {
		...context,
		manifest: root.manifest,
		actions: root.actions,
		refreshBoundaries: root.refreshBoundaries
	};
}

function emptyManifest(context: ExactServerContext): ExactServerContext['manifest'] {
	return {
		version: 1,
		endpoint: context.manifest.endpoint,
		actions: {},
		boundaries: {},
		actionBoundaries: {}
	};
}

function withBuildHeaders(
	response: ExactResponseLike,
	context: ExactServerContext
): ExactResponseLike {
	if (!context.preferredBuildKey) return response;
	return {
		...response,
		headers: {
			...response.headers,
			'X-Exact-Preferred-Build': context.preferredBuildKey
		}
	};
}

function requestHeader(request: ExactRequestLike, name: string): string | undefined {
	const headers = request.headers;
	if (!headers) return undefined;
	if (headers instanceof Headers) return headers.get(name) ?? undefined;
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() !== name) continue;
		return Array.isArray(value) ? value[0] : value;
	}
	return undefined;
}
