import { isJsonSafe } from './protocol.js';
import type { ResponseResourceBudget } from '@exactjs/core/framework/protocol-records';
import { responseResourceBudget, responseGraphLimits } from './response-resources.js';
import {
	attachExactObservationOwner,
	readExactObservationOwner
} from '@exactjs/core/framework/inspection-transport';
import { deriveRuntimeConfiguration as deriveServerContext } from '@exactjs/core/framework/configuration';
import { operationIdentity, operationObservationIdentity } from './operation-identity.js';
import { checkSecurityHooks } from './request-security.js';
export { checkSecurityHooks, type ExactSecurityResult } from './request-security.js';
import { ownRegistryEntry } from './registry-entry.js';
import { isTaskCancellation, logFrameworkEvent } from '@exactjs/core';
import {
	stateDeletionPathsMatchWrites,
	stateOutputPathsMatchWrites
} from '@exactjs/core/framework/protocol-records';
import { processExactOutputSync } from '@exactjs/plugin-host/runtime';
import {
	isExactFrameworkInvocationHandler,
	normalizeExactHandlerResult
} from './framework/trusted-handler.js';
import { jsonResponse } from './protocol.js';
import {
	continuationDependencies,
	createExactContinuationHandler
} from './continuation/execution.js';
import { createRequestLifetime } from './context/request-lifetime.js';
import type {
	ExactInvocationRequest,
	ExactOperationError,
	ExactOperationResult,
	ExactRequestLike,
	ExactTextResponse,
	ExactServerContext
} from './types.js';
import {
	boundaryHintsAllowed,
	partitionDiscriminatorMatchesBoundary,
	samePartitionAuthority,
	contextResponseMatchesContract,
	collectionMutationsMatchContract,
	isExecutorAllowed,
	isInvocationResultSafe,
	arrayResponseParser,
	publicContextMatchesContract,
	stateResponseMatchesContract,
	stateMatchesContract
} from './validation.js';

/** Returns whether an operation result is the protocol's structured error variant. */
export function isOperationError(result: ExactOperationResult): result is ExactOperationError {
	return result.ok === false;
}

/** Dispatches one operation, including operation-level security validation. */
export async function dispatchExactOperation(
	request: ExactRequestLike,
	input: ExactInvocationRequest,
	context: ExactServerContext
): Promise<ExactOperationResult> {
	return dispatchExactOperationAfterSecurity(request, input, context, false);
}

/** Dispatches one operation after top-level request security has already succeeded. */
export async function dispatchSecurityCheckedExactOperation(
	request: ExactRequestLike,
	input: ExactInvocationRequest,
	context: ExactServerContext
): Promise<ExactOperationResult> {
	return dispatchExactOperationAfterSecurity(request, input, context, true);
}

/** Serializes an extension-processed response while enforcing the configured byte limit. */
export function limitedJsonResponse(
	context: ExactServerContext,
	status: number,
	body: unknown,
	resources: ResponseResourceBudget = responseResourceBudget(context.logger)
): ExactTextResponse {
	const validated = processExactOutputSync(
		body,
		{ kind: 'invocation-response', signal: context.signal },
		context.outputExtensions ?? []
	);
	if (
		!isJsonSafe(
			validated,
			responseGraphLimits(context.limits ?? {}, resources, 'final response graph')
		)
	)
		throw new TypeError('Invalid exact response graph');
	const response = jsonResponse(status, validated);
	resources(
		'maxResponseBytes',
		context.limits?.maxResponseBytes,
		16 * 1024 * 1024,
		new TextEncoder().encode(response.body).byteLength,
		'final buffered response',
		'encoded UTF-8 bytes'
	);
	return response;
}

/** Returns whether a request targets the configured eXact endpoint. */
export function matchesConfiguredEndpoint(
	request: ExactRequestLike,
	endpoint: string | undefined
): boolean {
	if (!endpoint || !request.url) return true;
	try {
		const expected = new URL(endpoint, 'http://exact.local');
		const actual = new URL(request.url, 'http://exact.local');
		return actual.pathname === expected.pathname;
	} catch {
		return false;
	}
}

/** Records a security rejection using the framework's structured logger. */
export function logReject(context: ExactServerContext, message: string): void {
	logFrameworkEvent('warn', 'server', 'security', message, undefined, context.logger);
}

async function dispatchExactOperationAfterSecurity(
	request: ExactRequestLike,
	input: ExactInvocationRequest,
	context: ExactServerContext,
	securityChecked: boolean
): Promise<ExactOperationResult> {
	const reject = (
		status: number,
		error: ExactOperationError['error'],
		message: string
	): ExactOperationResult => {
		logReject(context, message);
		return { ok: false, ...operationIdentity(input), status, error };
	};

	if (!securityChecked) {
		const security = await checkSecurityHooks(request, context);
		if (security === 'unauthorized')
			return reject(403, 'forbidden', 'rejected unauthorized exact invocation');
		if (security === 'csrf')
			return reject(403, 'forbidden', 'rejected exact invocation with invalid csrf');
	}

	// Compiler-emitted opaque IDs form the execution boundary; module paths and
	// function names supplied by a client are never resolved dynamically.
	if (!isExecutorAllowed(input, context.contract)) {
		return reject(404, 'not_found', 'rejected unknown exact invocation id');
	}
	const arrayInvocation =
		input.type === 'invoke' ? ownRegistryEntry(context.contract.invocations, input.id) : undefined;
	const requiresArray = Boolean(
		arrayInvocation?.stateWrites.some((write) => write.arrayRoots?.length)
	);
	if (requiresArray ? input.arrayCompletion !== 4 : input.arrayCompletion !== undefined)
		return reject(400, 'bad_request', 'rejected mismatched Array completion contract');
	if (!boundaryHintsAllowed(input, context.contract)) {
		return reject(400, 'bad_request', 'rejected exact invocation with unknown boundary hints');
	}
	if (input.type === 'refresh') {
		const boundary = ownRegistryEntry(context.contract.boundaries, input.id);
		if (boundary?.kind === 'partition-range') {
			const authority = input.partition;
			const resolveCurrentAuthority = context.resolvePartitionAuthority;
			const currentAuthority = resolveCurrentAuthority
				? await resolveCurrentAuthority(input, context)
				: undefined;
			if (
				!authority ||
				!input.root ||
				authority.executionRoot !== input.root ||
				authority.version !== boundary.planVersion ||
				authority.buildKey !== boundary.buildKey ||
				authority.planEdgeId !== boundary.planEdgeId ||
				authority.planEdgeId !== input.id ||
				authority.ownerComponentId !== boundary.ownerComponentId ||
				authority.discriminator.kind !== boundary.discriminatorKind ||
				!partitionDiscriminatorMatchesBoundary(authority, boundary) ||
				(resolveCurrentAuthority
					? !currentAuthority || !samePartitionAuthority(authority, currentAuthority)
					: authority.generation !== boundary.generation)
			) {
				return reject(
					400,
					'bad_request',
					'rejected partition refresh with mismatched runtime authority'
				);
			}
		}
	}

	const invocation =
		input.type === 'invoke' ? ownRegistryEntry(context.contract.invocations, input.id) : undefined;
	const executor =
		input.type === 'invoke' ? ownRegistryEntry(context.contract.executors, input.id) : undefined;
	if (invocation && !stateMatchesContract(input.state, invocation.stateReads)) {
		return reject(400, 'bad_request', 'rejected exact invocation with mismatched state contract');
	}
	if (executor && !continuationDependencies(input.payload, invocation?.dependencies.length ?? 0)) {
		return reject(400, 'bad_request', 'rejected malformed exact continuation activation');
	}
	if (!publicContextMatchesContract(input.publicContext, invocation?.publicContexts ?? [])) {
		return reject(400, 'bad_request', 'rejected mismatched public context projection');
	}
	const manualHandler =
		input.type === 'invoke'
			? ownRegistryEntry(context.invocations, input.id)
			: ownRegistryEntry(context.refreshBoundaries, input.id);
	const payloadDecoder =
		input.type === 'invoke'
			? ownRegistryEntry(context.payloadDecoders?.invocations, input.id)
			: ownRegistryEntry(context.payloadDecoders?.boundaries, input.id);
	if (
		manualHandler &&
		!isExactFrameworkInvocationHandler(manualHandler) &&
		input.payload !== undefined &&
		!payloadDecoder
	)
		return reject(
			400,
			'bad_request',
			'rejected manual exact operation payload without a registered decoder'
		);
	if (payloadDecoder && input.payload !== undefined) {
		try {
			const decoded = payloadDecoder(input.payload, input, context);
			input = {
				...input,
				payload:
					decoded && typeof (decoded as PromiseLike<unknown>).then === 'function'
						? await decoded
						: decoded
			};
		} catch {
			return reject(400, 'bad_request', 'rejected invalid exact operation payload');
		}
	}

	try {
		const authorize = context.authorizeOperation;
		if (
			authorize !== undefined &&
			(await Reflect.apply(authorize, context, [request, input, context])) !== true
		)
			return reject(403, 'forbidden', 'rejected unauthorized exact operation');
	} catch {
		return reject(403, 'forbidden', 'exact operation authorization failed');
	}

	const handler =
		input.type === 'invoke'
			? (manualHandler ??
				(invocation && executor ? createExactContinuationHandler(invocation, executor) : undefined))
			: manualHandler;
	if (!handler)
		return reject(404, 'not_found', 'rejected exact invocation without registered handler');

	const observation = operationObservationIdentity(context, input, invocation?.componentId);
	context.requestDebugRuntime?.observe({
		kind: executor ? 'continuation.receive' : 'task.start',
		...observation
	});
	const operationLifetime =
		request.signal && request.signal !== context.signal
			? createRequestLifetime(context.signal, request.signal)
			: undefined;
	try {
		const requestContext = operationLifetime
			? deriveServerContext(context, () => ({ signal: operationLifetime.signal }))
			: context;
		const localObservationOwner = readExactObservationOwner(request);
		const observedRequestContext =
			context.requestDebugRuntime || localObservationOwner
				? deriveServerContext(requestContext, () => ({
						onContextAccess(
							observed: Parameters<NonNullable<ExactServerContext['onContextAccess']>>[0]
						) {
							const { componentId, operationId, token, scope } = observed;
							requestContext.onContextAccess?.(
								attachExactObservationOwner(observed, localObservationOwner)
							);
							context.requestDebugRuntime?.observe({
								kind: 'context.access',
								...observation,
								componentTypeId: componentId,
								operationId,
								attributes: { token, scope }
							});
						}
					}))
				: requestContext;
		const handled = await handler(input, observedRequestContext);
		const result = manualHandler ? normalizeExactHandlerResult(manualHandler, handled) : handled;
		context.requestDebugRuntime?.observe({
			kind: executor ? 'continuation.respond' : 'task.settle',
			...observation
		});
		const outputResources = responseResourceBudget(context.logger);
		if (
			!isInvocationResultSafe(
				result,
				{
					maxJsonDepth: context.limits?.maxJsonDepth,
					maxJsonNodes: context.limits?.maxJsonNodes,
					maxResponseBytes: context.limits?.maxResponseBytes,
					maxPatches: context.limits?.maxPatches
				},
				outputResources,
				arrayResponseParser(executor?.array, context.limits?.maxJsonNodes, outputResources)
			)
		) {
			return reject(500, 'internal_error', 'rejected non-serializable exact invocation result');
		}
		if (
			input.type === 'invoke' &&
			((result.statePaths !== undefined &&
				!stateOutputPathsMatchWrites(result.statePaths, invocation?.stateWrites ?? [])) ||
				!stateResponseMatchesContract(
					result.state,
					invocation?.stateWrites ?? [],
					result.statePaths
				) ||
				!stateDeletionPathsMatchWrites(result.deletions ?? [], invocation?.stateWrites ?? []) ||
				!collectionMutationsMatchContract(result.mutations, invocation?.stateWrites ?? []) ||
				!contextResponseMatchesContract(result.contexts, invocation?.contextWrites ?? []))
		) {
			return reject(
				500,
				'internal_error',
				'rejected exact invocation result outside its continuation write contract'
			);
		}
		if (input.type === 'refresh' && (result.deletions?.length || result.statePaths !== undefined))
			return reject(
				500,
				'internal_error',
				'rejected continuation deletion metadata in a refresh result'
			);
		if (input.type === 'refresh') {
			const boundary = ownRegistryEntry(context.contract.boundaries, input.id);
			if (boundary?.kind === 'partition-range') {
				const allowed = new Set(boundary.patchTargets ?? [boundary.id]);
				if (result.patches?.some((patch) => !allowed.has(patch.id))) {
					return reject(
						500,
						'internal_error',
						'rejected partition refresh outside its declared range containment'
					);
				}
			}
		}
		return {
			ok: true,
			...operationIdentity(input),
			...result,
			...(requiresArray ? { arrayCompletion: 4 as const } : {})
		};
	} catch (error) {
		const signal = operationLifetime?.signal ?? context.signal;
		// A disconnect is expected only when this rejection belongs to its aborted lifetime.
		// Do not hide an independent application failure that races with cancellation.
		// Equal primitive values cannot establish that a rejection came from this signal.
		if (
			signal?.aborted &&
			((error !== null && typeof error === 'object' && error === signal.reason) ||
				(isTaskCancellation(error) && error.reason === signal.reason))
		) {
			context.requestDebugRuntime?.observe({ kind: 'task.cancel', ...observation });
			return {
				ok: false,
				...operationIdentity(input),
				status: 499,
				error: 'internal_error'
			};
		}
		context.requestDebugRuntime?.observe({
			kind: 'error',
			...observation,
			reason: 'server-operation-failed'
		});
		logFrameworkEvent(
			'error',
			'server',
			'request',
			'exact invocation failed',
			error,
			context.logger
		);
		return {
			ok: false,
			...operationIdentity(input),
			status: 500,
			error: 'internal_error'
		};
	} finally {
		operationLifetime?.dispose();
	}
}
