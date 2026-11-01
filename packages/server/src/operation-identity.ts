import type { ExactInvocationRequest, ExactServerContext } from './types.js';

/** Copies operation identity while keeping an absent optional ID out of the protocol envelope. */
export function operationIdentity(
	input: Pick<ExactInvocationRequest, 'type' | 'id' | 'opId'>
): Pick<ExactInvocationRequest, 'type' | 'id' | 'opId'> {
	return {
		type: input.type,
		id: input.id,
		...(input.opId === undefined ? {} : { opId: input.opId })
	};
}

/** Captures opaque execution and component identities for an operation’s inspection events. */
export function operationObservationIdentity(
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
