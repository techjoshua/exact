import type {
	ExactComponentResumptionIR,
	ExactContinuationIR,
	ExactContextEffect,
	ExactStateEffect
} from '../types.js';

/** Validates the compiler-owned continuation contract loaded from an artifact. */
export function isExactContinuation(value: unknown): value is ExactContinuationIR {
	if (!record(value)) return false;
	return (
		typeof value.id === 'string' &&
		(value.kind === 'task' || value.kind === 'action') &&
		(value.label === undefined || typeof value.label === 'string') &&
		typeof value.componentId === 'string' &&
		typeof value.taskId === 'string' &&
		(value.placement === 'server' || value.placement === 'isomorphic') &&
		typeof value.async === 'boolean' &&
		record(value.activation) &&
		Array.isArray(value.activation.stateReads) &&
		value.activation.stateReads.every(isStateEffect) &&
		Array.isArray(value.activation.dependencies) &&
		value.activation.dependencies.every(isDependency) &&
		Array.isArray(value.activation.serverContexts) &&
		value.activation.serverContexts.every(isContextEffect) &&
		Array.isArray(value.activation.publicContexts) &&
		value.activation.publicContexts.every(isContextEffect) &&
		record(value.effects) &&
		Array.isArray(value.effects.stateWrites) &&
		value.effects.stateWrites.every(isStateEffect) &&
		Array.isArray(value.effects.contextWrites) &&
		value.effects.contextWrites.every(isContextEffect) &&
		Array.isArray(value.effects.boundaries) &&
		value.effects.boundaries.every((boundary) => typeof boundary === 'string') &&
		record(value.ownership) &&
		value.ownership.componentId === value.componentId &&
		(value.ownership.lifetime === 'component' || value.ownership.lifetime === 'invocation') &&
		(value.kind === 'action'
			? typeof value.label === 'string' && isInvocation(value.invocation)
			: value.invocation === undefined && value.label === undefined) &&
		value.cancellation === 'abort-signal'
	);
}

/** Validates distinct server-render and public browser-resumption records. */
export function isExactComponentResumption(value: unknown): value is ExactComponentResumptionIR {
	if (!record(value) || typeof value.componentId !== 'string') return false;
	return (
		record(value.serverRender) &&
		stringArray(value.serverRender.stateReads) &&
		Array.isArray(value.serverRender.serverContexts) &&
		value.serverRender.serverContexts.every(isContextEffect) &&
		record(value.client) &&
		stringArray(value.client.statePaths) &&
		stringArray(value.client.valueCaptures) &&
		stringArray(value.client.boundaries)
	);
}

/** Reports whether a runtime-neutral state effect has a supported shape. */
function isStateEffect(value: unknown): value is ExactStateEffect {
	if (!record(value)) return false;
	return (
		typeof value.path === 'string' &&
		(value.kind === 'read' || value.kind === 'write') &&
		(value.confidence === 'exact' ||
			value.confidence === 'broad' ||
			value.confidence === 'unknown') &&
		(value.operation === undefined || value.operation === 'map' || value.operation === 'set')
	);
}

/** Reports whether a server context effect has a supported shape. */
function isContextEffect(value: unknown): value is ExactContextEffect {
	if (!record(value)) return false;
	return (
		typeof value.token === 'string' &&
		(value.kind === 'read' || value.kind === 'write') &&
		(value.confidence === 'exact' || value.confidence === 'unknown')
	);
}

/** Reports whether a scheduled capture descriptor has a supported shape. */
function isDependency(value: unknown): boolean {
	if (!record(value)) return false;
	return (
		Number.isSafeInteger(value.index) &&
		['state', 'props', 'derived', 'argument'].includes(String(value.source))
	);
}

/** Reports whether action invocation metadata is finite and transport-safe. */
function isInvocation(value: unknown): boolean {
	if (!record(value) || !Array.isArray(value.arguments)) return false;
	return (
		value.arguments.every(
			(argument) =>
				record(argument) && Number.isSafeInteger(argument.index) && argument.source === 'argument'
		) && ['parallel', 'latest', 'queue'].includes(String(value.concurrency))
	);
}

/** Reports whether a protocol field is an array of strings. */
function stringArray(value: unknown): value is string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Narrows an unknown protocol value to a non-array object. */
function record(value: unknown): value is Record<string, any> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}
