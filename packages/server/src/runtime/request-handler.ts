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
			publishExactProfile(
				context.onProfile,
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
			body = await readGatewayBody(request, context.limits?.maxRequestBytes);
		} catch {
			return jsonResponse(400, { error: 'bad_request' });
		}
		return context.gateway.forward(request, body, context);
	}

	let input: ExactProtocolRequest;
	try {
		input = parseExactRequestBody(await readBody(request, context.limits?.maxRequestBytes), {
			maxBatchOperations: context.limits?.maxBatchOperations,
			maxJsonDepth: context.limits?.maxJsonDepth,
			maxJsonNodes: context.limits?.maxJsonNodes,
			maxRequestBytes: context.limits?.maxRequestBytes
		});
	} catch {
		logReject(context, 'rejected malformed exact invocation');
		return jsonResponse(400, { error: 'bad_request' });
	}

	const debugRuntime =
		input.type === 'debug'
			? (debugOwnerContext.debugRuntime ?? exactServerDebugRuntime(debugOwnerContext))
			: undefined;

	if (input.type === 'debug') return debugRuntime!.handle(request, input);

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
		? await exactServerDebugRuntime(debugOwnerContext).createRequestRuntime(request, debugSessionId)
		: undefined;
	const responseContext = requestDebugRuntime ? { ...context, requestDebugRuntime } : context;
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
			await streamExactResponse(request, input, responseContext, dispatch),
			context
		);
	}

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
					limitedJsonResponse(responseContext, 200, {
						ok: true,
						version: 1,
						results
					} satisfies ExactBatchResult),
					requestDebugRuntime,
					responseContext
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
			: limitedJsonResponse(responseContext, 200, result);
		return withBuildHeaders(
			withRequestObservations(response, requestDebugRuntime, responseContext),
			context
		);
	} catch (error) {
		requestDebugRuntime?.dispose();
		throw error;
	}
}

function withRequestObservations(
	response: ExactTextResponse,
	runtime: ExactServerRequestDebugRuntime | undefined,
	context: ExactServerContext
): ExactResponseLike {
	if (!runtime) return response;
	try {
		const observations = [...runtime.drain()];
		if (!observations.length) return response;
		const body = JSON.parse(response.body) as Record<string, unknown>;
		const maximum = context.limits?.maxResponseBytes ?? 16 * 1024 * 1024;
		const encoder = new TextEncoder();
		let start = 0;
		let encoded = encodeObservations(start);
		if (encoder.encode(encoded).byteLength > maximum) {
			let low = 1;
			let high = observations.length;
			while (low < high) {
				const middle = Math.floor((low + high) / 2);
				if (encoder.encode(encodeObservations(middle)).byteLength <= maximum) high = middle;
				else low = middle + 1;
			}
			start = low;
			encoded = encodeObservations(start);
		}
		if (start === observations.length || encoder.encode(encoded).byteLength > maximum)
			return response;
		return { ...response, body: encoded };

		function encodeObservations(index: number): string {
			body.__exactObservations = observations.slice(index);
			return JSON.stringify(body);
		}
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
		return {
			...context,
			contract: emptyContract(context),
			invocations: {},
			refreshBoundaries: {},
			payloadDecoders: {}
		};
	}
	return {
		...context,
		debugBuildKey: build.buildKey,
		contract: root.contract,
		invocations: root.invocations,
		refreshBoundaries: root.refreshBoundaries,
		payloadDecoders: root.payloadDecoders
	};
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
