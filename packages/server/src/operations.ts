import { logFrameworkEvent } from '@exactjs/core';
import { normalizeProtocolLimit as positiveLimit } from '@exactjs/core/framework/protocol-records';
import { processExactOutputSync } from '@exactjs/plugin-host/runtime';
import {
	isExactFrameworkInvocationHandler,
	normalizeExactHandlerResult
} from './framework/trusted-handler.js';
import { jsonResponse } from './protocol.js';
import {
	continuationDependencies,
	createExactContinuationHandler
} from './continuation-execution.js';
import type {
	ExactInvocationRequest,
	ExactOperationError,
	ExactOperationResult,
	ExactProtocolRequest,
	ExactRequestLike,
	ExactResponseLike,
	ExactServerContext
} from './types.js';
import {
	boundaryHintsAllowed,
	contextResponseMatchesContract,
	collectionMutationsMatchContract,
	isExecutorAllowed,
	isInvocationResultSafe,
	publicContextMatchesContract,
	stateResponseMatchesContract,
	stateMatchesContract
} from './validation.js';

/** Describes the result produced by exact security. */
export type ExactSecurityResult = 'allowed' | 'unauthorized' | 'csrf';

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

/** Runs authorization and CSRF hooks, converting hook failures into closed security results. */
export async function checkSecurityHooks(
	request: ExactRequestLike,
	input: ExactProtocolRequest,
	context: ExactServerContext
): Promise<ExactSecurityResult> {
	if (context.authorize) {
		try {
			if (!(await context.authorize(request, input, context))) return 'unauthorized';
		} catch (error) {
			logFrameworkEvent(
				'error',
				'server',
				'security',
				'exact authorization hook failed',
				error,
				context.logger
			);
			return 'unauthorized';
		}
	}
	if (context.validateCsrf) {
		try {
			if (!(await context.validateCsrf(request, input, context))) return 'csrf';
		} catch (error) {
			logFrameworkEvent(
				'error',
				'server',
				'security',
				'exact csrf hook failed',
				error,
				context.logger
			);
			return 'csrf';
		}
	}
	return 'allowed';
}

/** Serializes an extension-processed response while enforcing the configured byte limit. */
export function limitedJsonResponse(
	context: ExactServerContext,
	status: number,
	body: unknown
): ExactResponseLike {
	const validated = processExactOutputSync(
		body,
		{ kind: 'invocation-response', signal: context.signal },
		context.outputExtensions ?? []
	);
	const response = jsonResponse(status, validated);
	const limit = positiveLimit(context.limits?.maxResponseBytes, 16 * 1024 * 1024);
	if (new TextEncoder().encode(response.body).byteLength <= limit) return response;
	logReject(context, 'rejected oversized exact invocation response');
	return jsonResponse(500, { error: 'internal_error' });
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
		return { ok: false, type: input.type, id: input.id, opId: input.opId, status, error };
	};

	// Compiler-emitted opaque IDs form the execution boundary; module paths and
	// function names supplied by a client are never resolved dynamically.
	if (!isExecutorAllowed(input, context.contract)) {
		return reject(404, 'not_found', 'rejected unknown exact invocation id');
	}
	if (!boundaryHintsAllowed(input, context.contract)) {
		return reject(400, 'bad_request', 'rejected exact invocation with unknown boundary hints');
	}
	if (input.type === 'refresh') {
		const boundary = context.contract.boundaries[input.id];
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

	const invocation = input.type === 'invoke' ? context.contract.invocations[input.id] : undefined;
	const executor = input.type === 'invoke' ? context.contract.executors?.[input.id] : undefined;
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
			? context.invocations?.[input.id]
			: context.refreshBoundaries?.[input.id];
	const payloadDecoder =
		input.type === 'invoke'
			? context.payloadDecoders?.invocations?.[input.id]
			: context.payloadDecoders?.boundaries?.[input.id];
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

	if (!securityChecked) {
		const security = await checkSecurityHooks(request, input, context);
		if (security === 'unauthorized')
			return reject(403, 'forbidden', 'rejected unauthorized exact invocation');
		if (security === 'csrf')
			return reject(403, 'forbidden', 'rejected exact invocation with invalid csrf');
	}

	const handler =
		input.type === 'invoke'
			? (manualHandler ??
				(invocation && executor ? createExactContinuationHandler(invocation, executor) : undefined))
			: manualHandler;
	if (!handler)
		return reject(404, 'not_found', 'rejected exact invocation without registered handler');

	const observation = observationIdentity(context, input, invocation?.componentId);
	context.debugRuntime?.observe({
		kind: executor ? 'continuation.receive' : 'task.start',
		...observation
	});
	try {
		const requestContext =
			request.signal && request.signal !== context.signal
				? { ...context, signal: request.signal }
				: context;
		const observedRequestContext = context.debugRuntime
			? {
					...requestContext,
					onContextAccess(
						observed: Parameters<NonNullable<ExactServerContext['onContextAccess']>>[0]
					) {
						requestContext.onContextAccess?.(observed);
						context.debugRuntime!.observe({
							kind: 'context.access',
							...observation,
							componentTypeId: observed.componentId,
							operationId: observed.operationId,
							attributes: Object.freeze({
								token: observed.token,
								scope: observed.scope
							})
						});
					}
				}
			: requestContext;
		const handled = await handler(input, observedRequestContext);
		const result = manualHandler ? normalizeExactHandlerResult(manualHandler, handled) : handled;
		context.debugRuntime?.observe({
			kind: executor ? 'continuation.respond' : 'task.settle',
			...observation
		});
		if (
			!isInvocationResultSafe(result, {
				maxJsonDepth: context.limits?.maxJsonDepth,
				maxJsonNodes: context.limits?.maxJsonNodes,
				maxResponseBytes: context.limits?.maxResponseBytes,
				maxPatches: context.limits?.maxPatches
			})
		) {
			return reject(500, 'internal_error', 'rejected non-serializable exact invocation result');
		}
		if (
			input.type === 'invoke' &&
			(!stateResponseMatchesContract(result.state, invocation?.stateWrites ?? []) ||
				!collectionMutationsMatchContract(result.mutations, invocation?.stateWrites ?? []) ||
				!contextResponseMatchesContract(result.contexts, invocation?.contextWrites ?? []))
		) {
			return reject(
				500,
				'internal_error',
				'rejected exact invocation result outside its continuation write contract'
			);
		}
		if (input.type === 'refresh') {
			const boundary = context.contract.boundaries[input.id];
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
		return { ok: true, type: input.type, id: input.id, opId: input.opId, ...result };
	} catch (error) {
		context.debugRuntime?.observe({
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
			type: input.type,
			id: input.id,
			opId: input.opId,
			status: 500,
			error: 'internal_error'
		};
	}
}

function partitionDiscriminatorMatchesBoundary(
	authority: NonNullable<ExactInvocationRequest['partition']>,
	boundary: ExactServerContext['contract']['boundaries'][string]
): boolean {
	const discriminator = authority.discriminator;
	if (discriminator.kind === 'single') return true;
	if (discriminator.kind === 'branch')
		return boundary.discriminatorValues?.includes(discriminator.branch) === true;
	return discriminator.list === boundary.parentPlanId;
}

function samePartitionAuthority(
	left: NonNullable<ExactInvocationRequest['partition']>,
	right: NonNullable<ExactInvocationRequest['partition']>
): boolean {
	const leftDiscriminator = left.discriminator;
	const rightDiscriminator = right.discriminator;
	const sameDiscriminator =
		leftDiscriminator.kind === rightDiscriminator.kind &&
		(leftDiscriminator.kind === 'single' ||
			(leftDiscriminator.kind === 'branch' &&
				rightDiscriminator.kind === 'branch' &&
				leftDiscriminator.branch === rightDiscriminator.branch) ||
			(leftDiscriminator.kind === 'keyed' &&
				rightDiscriminator.kind === 'keyed' &&
				leftDiscriminator.list === rightDiscriminator.list &&
				leftDiscriminator.keyToken === rightDiscriminator.keyToken));
	return (
		left.version === right.version &&
		left.buildKey === right.buildKey &&
		left.executionRoot === right.executionRoot &&
		left.planEdgeId === right.planEdgeId &&
		left.ownerComponentId === right.ownerComponentId &&
		left.generation === right.generation &&
		sameDiscriminator
	);
}

function observationIdentity(
	context: ExactServerContext,
	input: ExactInvocationRequest,
	componentTypeId: string | undefined
): {
	buildKey: string;
	executionRoot: string;
	componentTypeId: string;
	operationId?: string;
	generation?: number;
	requestId?: string;
} {
	const executionRoot = input.root ?? 'page';
	const buildKey =
		context.debugBuildKey ??
		context.inspectionCatalogs?.find((catalog) => catalog.roots[executionRoot])?.buildKey ??
		'unregistered-build';
	return {
		buildKey,
		executionRoot,
		componentTypeId: componentTypeId ?? 'server-operation',
		...(input.opId ? { operationId: input.opId } : {}),
		...(typeof (input.payload as { generation?: unknown } | undefined)?.generation === 'number'
			? { generation: (input.payload as { generation: number }).generation }
			: {}),
		...(context.requestContext?.traceId ? { requestId: context.requestContext.traceId } : {})
	};
}
