import { responseResourceBudget } from '../response-resources.js';
import {
	normalizeProtocolLimit,
	type ResponseResourceBudget
} from '@exactjs/core/framework/protocol-records';
import { deriveRuntimeConfiguration as deriveServerContext } from '@exactjs/core/framework/configuration';
import { readGatewayBody } from '../gateway/body.js';
import { runWithExactRequestScope } from '../context.js';
import {
	checkSecurityHooks,
	dispatchSecurityCheckedExactOperation,
	isOperationError,
	limitedJsonResponse,
	logReject,
	matchesConfiguredEndpoint
} from '../operations.js';
import { jsonResponse, parseExactRequestBody, readBody } from '../protocol.js';
import { dispatchExactBatch, streamExactResponse, wantsStreaming } from '../streaming.js';
import { exactServerDebugRuntime } from '../debug/runtime.js';
import { scopedDebugRequest } from '../debug/request-origin.js';
import type {
	ExactBatchResult,
	ExactInvocationRequest,
	ExactProtocolRequest,
	ExactRequestLike,
	ExactResponseLike,
	ExactTextResponse,
	ExactServerContext,
	ExactServerRequestDebugRuntime,
	ServerProfileEvent
} from '../types.js';
import type { ExactRemoteBuildRegistration } from '../remote-build-contracts.js';

import { publishExactProfile } from '@exactjs/instrumentation';

/** Handles an eXact endpoint request using the runtime-neutral server protocol. */
export async function handleExactRequest(
	request: ExactRequestLike,
	context: ExactServerContext
): Promise<ExactResponseLike> {
	const profileStarted = context.onProfile ? performance.now() : undefined;
	try {
		return await handleExactRequestOwned(request, context, context);
	} finally {
		if (profileStarted !== undefined) {
			publishExactProfile(context.onProfile, {
				subsystem: 'server',
				phase: 'request',
				elapsedMs: performance.now() - profileStarted
			} satisfies ServerProfileEvent);
		}
	}
}

async function handleExactRequestOwned(
	request: ExactRequestLike,
	context: ExactServerContext,
	debugOwnerContext: ExactServerContext
): Promise<ExactResponseLike> {
	if (!context.requestContext) {
		return runWithExactRequestScope(
			request,
			context,
			(scoped) => handleExactRequestOwned(request, scoped, debugOwnerContext),
			request.platformRequest ?? request
		);
	}
	if (request.method.toUpperCase() !== 'POST') {
		return jsonResponse(405, { error: 'method_not_allowed' });
	}

	if (!matchesConfiguredEndpoint(request, context.contract.endpoint)) {
		logReject(context, 'rejected exact invocation for mismatched endpoint');
		return jsonResponse(404, { error: 'not_found' });
	}

	const security = await checkSecurityHooks(request, context);
	if (security !== 'allowed') {
		logReject(context, 'rejected exact request security');
		return jsonResponse(403, { error: 'forbidden' });
	}
	if (requestHeader(request, 'x-exact-binding') !== undefined) {
		if (!context.gateway) return jsonResponse(404, { error: 'unknown_binding' });
		let body: string | Uint8Array;
		try {
			body = await readGatewayBody(request, context.limits?.maxRequestBytes, context.logger);
		} catch {
			return jsonResponse(400, { error: 'bad_request' });
		}
		return context.gateway.forward(request, body, context);
	}

	let input: ExactProtocolRequest;
	try {
		input = parseExactRequestBody(
			await readBody(request, context.limits?.maxRequestBytes),
			context.limits,
			context.logger
		);
	} catch {
		logReject(context, 'rejected malformed exact invocation');
		return jsonResponse(400, { error: 'bad_request' });
	}

	const debugRuntime =
		input.type === 'debug'
			? (debugOwnerContext.debugRuntime ?? exactServerDebugRuntime(debugOwnerContext))
			: undefined;

	if (input.type === 'debug')
		return debugRuntime!.handle(
			scopedDebugRequest(request, context.requestContext.publicOrigin),
			input
		);

	const build = resolveRemoteBuild(request, context);
	if (build === null) {
		return withBuildHeaders(jsonResponse(410, { error: 'exact_build_unsupported' }), context);
	}
	const componentAuthorization = build?.componentAuthorization ?? context.componentAuthorization;
	if (
		componentAuthorization &&
		requestHeader(request, 'x-exact-component-authorization') !== componentAuthorization.fingerprint
	)
		return withBuildHeaders(jsonResponse(410, { error: 'exact_build_unsupported' }), context);
	const debugSessionId = requestHeader(request, 'x-exact-debug-session');
	const requestDebugRuntime = debugSessionId
		? await exactServerDebugRuntime(debugOwnerContext).createRequestRuntime(
				scopedDebugRequest(request, context.requestContext.publicOrigin),
				debugSessionId
			)
		: undefined;
	const responseContext = requestDebugRuntime
		? deriveServerContext(context, () => ({ requestDebugRuntime }))
		: context;
	const dispatch = build
		? (
				operationRequest: ExactRequestLike,
				operation: ExactInvocationRequest,
				operationContext: ExactServerContext
			) =>
				dispatchSecurityCheckedExactOperation(
					operationRequest,
					operation,
					contextForRemoteOperation(operationContext, build, operation)
				)
		: dispatchSecurityCheckedExactOperation;

	if (wantsStreaming(request)) {
		return withBuildHeaders(
			await streamExactResponse(request, input, responseContext, dispatch),
			context
		);
	}

	const resources = responseResourceBudget(responseContext.logger);
	if (input.type === 'batch') {
		try {
			const results = await dispatchExactBatch(
				request,
				input.operations,
				responseContext,
				dispatch
			);
			return withBuildHeaders(
				withRequestObservations(
					limitedJsonResponse(
						responseContext,
						200,
						{
							ok: true,
							version: 1,
							results
						} satisfies ExactBatchResult,
						resources
					),
					requestDebugRuntime,
					responseContext,
					resources
				),
				context
			);
		} catch (error) {
			requestDebugRuntime?.dispose();
			throw error;
		}
	}

	try {
		const result = await dispatch(request, input, responseContext);
		const response = isOperationError(result)
			? jsonResponse(result.status, { error: result.error })
			: limitedJsonResponse(responseContext, 200, result, resources);
		return withBuildHeaders(
			withRequestObservations(response, requestDebugRuntime, responseContext, resources),
			context
		);
	} catch (error) {
		requestDebugRuntime?.dispose();
		throw error;
	}
}

/** Serializes once and retains the newest complete event suffix within the final UTF-8 byte limit. */
function withRequestObservations(
	response: ExactTextResponse,
	runtime: ExactServerRequestDebugRuntime | undefined,
	context: ExactServerContext,
	resources: ResponseResourceBudget
): ExactResponseLike {
	if (!runtime) return response;
	try {
		const observations = [...runtime.drain()];
		if (!observations.length) return response;
		const body = JSON.parse(response.body) as Record<string, unknown>;
		if (Array.isArray(body)) return response;
		// Private protocol fields must not invoke inherited setters on the parsed envelope.
		Object.setPrototypeOf(body, null);
		// Optional telemetry is selected before applying the response cap to published bytes.
		// Omitted caps remain warning-only, while explicit caps keep the newest complete suffix.
		const maximum = normalizeProtocolLimit(
			context.limits?.maxResponseBytes,
			Number.MAX_SAFE_INTEGER
		);
		// Append at the end even if an output extension supplied this reserved field.
		delete body.__exactObservations;
		body.__exactObservations = [];
		const empty = JSON.stringify(body);
		const encoder = new TextEncoder();
		const encoded = observations.map((event) => JSON.stringify(event) ?? 'null');
		const sizes = encoded.map((event) => encoder.encode(event).byteLength);
		let size =
			encoder.encode(empty).byteLength +
			sizes.reduce((sum, bytes) => sum + bytes, 0) +
			encoded.length -
			1;
		let start = 0;
		while (size > maximum && start < encoded.length) {
			size -= sizes[start++]! + (start < encoded.length ? 1 : 0);
		}
		if (start === encoded.length) return response;
		const serialized = empty.slice(0, -2) + encoded.slice(start).join(',') + ']}';
		resources(
			'maxResponseBytes',
			context.limits?.maxResponseBytes,
			16 * 1024 * 1024,
			size,
			'buffered response with observations',
			'encoded UTF-8 bytes'
		);
		return { ...response, body: serialized };
	} finally {
		runtime.dispose();
	}
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
		return deriveServerContext(context, () => ({
			contract: emptyContract(context),
			invocations: {},
			refreshBoundaries: {},
			payloadDecoders: {}
		}));
	}
	return deriveServerContext(context, () => ({
		debugBuildKey: build.buildKey,
		contract: root.contract,
		invocations: root.invocations,
		refreshBoundaries: root.refreshBoundaries,
		payloadDecoders: root.payloadDecoders
	}));
}

function emptyContract(context: ExactServerContext): ExactServerContext['contract'] {
	return {
		version: 1,
		endpoint: context.contract.endpoint,
		invocations: {},
		executors: {},
		boundaries: {}
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
