import { logFrameworkEvent } from '@exactjs/core';
import { processExactOutputSync } from '@exactjs/plugin-host/runtime';
import { jsonResponse } from './protocol.js';
import {
	continuationDependencies,
	createExactContinuationHandler
} from './continuation-execution.js';
import type {
	ExactBatchRequest,
	ExactInvocationRequest,
	ExactOperationError,
	ExactOperationResult,
	ExactRequestLike,
	ExactResponseLike,
	ExactServerContext
} from './types.js';
import {
	boundaryHintsAllowed,
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
	input: ExactInvocationRequest | ExactBatchRequest,
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
		{ kind: 'action-response', signal: context.signal },
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

	const action = input.type === 'action' ? context.contract.actions[input.id] : undefined;
	const executor =
		input.type === 'action' ? context.contract.executors?.[input.id] : undefined;
	if (action && !stateMatchesContract(input.state, action.stateReads)) {
		return reject(400, 'bad_request', 'rejected exact invocation with mismatched state contract');
	}
	if (
		executor &&
		!continuationDependencies(input.payload, action?.dependencies.length ?? 0)
	) {
		return reject(400, 'bad_request', 'rejected malformed exact continuation activation');
	}
	if (!publicContextMatchesContract(input.publicContext, action?.publicContexts ?? [])) {
		return reject(400, 'bad_request', 'rejected mismatched public context projection');
	}

	if (!securityChecked) {
		const security = await checkSecurityHooks(request, input, context);
		if (security === 'unauthorized')
			return reject(403, 'forbidden', 'rejected unauthorized exact invocation');
		if (security === 'csrf')
			return reject(403, 'forbidden', 'rejected exact invocation with invalid csrf');
	}

	const handler =
		input.type === 'action'
			? (context.actions?.[input.id] ??
				(action && executor ? createExactContinuationHandler(action, executor) : undefined))
			: context.refreshBoundaries?.[input.id];
	if (!handler)
		return reject(404, 'not_found', 'rejected exact invocation without registered handler');

	try {
		const requestContext =
			request.signal && request.signal !== context.signal
				? { ...context, signal: request.signal }
				: context;
		const result = await handler(input, requestContext);
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
			input.type === 'action' &&
			!stateResponseMatchesContract(result.state, action?.stateWrites ?? [])
		) {
			return reject(
				500,
				'internal_error',
				'rejected exact invocation result outside its state write contract'
			);
		}
		return { ok: true, type: input.type, id: input.id, opId: input.opId, ...result };
	} catch (error) {
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

function positiveLimit(value: number | undefined, fallback: number): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
