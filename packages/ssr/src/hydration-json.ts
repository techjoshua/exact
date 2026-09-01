import { normalizeProtocolLimit as positiveLimit } from '@exactjs/core/framework/protocol-records';

type ValidationState = {
	readonly active: Set<object>;
	readonly onValidatedArray?: (value: unknown[]) => void;
	readonly pathArrays: boolean[];
	readonly pathKeys: string[];
	readonly structurallyKnown?: { has(value: object): boolean };
	readonly maxDepth: number;
	readonly maxNodes: number;
	nodes: number;
};

/**
 * Validates a hydration graph without invoking accessors.
 *
 * The caller may synchronously read the graph after this succeeds because every enumerable value
 * property and container prototype has already crossed the serialization trust boundary.
 */
export function validateJsonSafeHydrationValue(
	value: unknown,
	limits: {
		maxDepth?: number;
		maxNodes?: number;
		onValidatedArray?: (value: unknown[]) => void;
		structurallyKnown?: { has(value: object): boolean };
	}
): string | undefined {
	const state: ValidationState = {
		active: new Set(),
		pathArrays: [],
		pathKeys: [],
		structurallyKnown: limits.structurallyKnown,
		maxDepth: positiveLimit(limits.maxDepth, 100),
		maxNodes: positiveLimit(limits.maxNodes, 100_000),
		onValidatedArray: limits.onValidatedArray,
		nodes: 0
	};
	try {
		return validateValue(value, 0, state) ? undefined : formatValidationPath(state);
	} catch {
		return '$';
	}
}

function validateValue(value: unknown, depth: number, state: ValidationState): boolean {
	if (++state.nodes > state.maxNodes || depth > state.maxDepth) return false;
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
	if (typeof value === 'number') return Number.isFinite(value);
	if (typeof value !== 'object' || state.active.has(value)) return false;
	if (
		!state.structurallyKnown?.has(value) &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) !== Object.prototype
	)
		return false;
	state.active.add(value);
	try {
		return validateContainer(value, depth, state);
	} finally {
		state.active.delete(value);
	}
}

function validateContainer(source: object, depth: number, state: ValidationState): boolean {
	const array = Array.isArray(source);
	const structurallyKnown = state.structurallyKnown?.has(source) ?? false;
	if (array && structurallyKnown) {
		for (let index = 0; index < source.length; index++) {
			pushValidationPath(state, String(index), true);
			if (!validateValue(source[index], depth + 1, state)) return false;
			popValidationPath(state);
		}
		state.onValidatedArray?.(source);
		return true;
	}
	for (const key of Object.keys(source)) {
		pushValidationPath(state, key, array);
		if (structurallyKnown) {
			if (!validateValue((source as Record<string, unknown>)[key], depth + 1, state)) return false;
			popValidationPath(state);
			continue;
		}
		const descriptor = Object.getOwnPropertyDescriptor(source, key);
		if (!descriptor || !('value' in descriptor)) return false;
		if (!validateValue(descriptor.value, depth + 1, state)) return false;
		popValidationPath(state);
	}
	if (array) state.onValidatedArray?.(source as unknown[]);
	return true;
}

function pushValidationPath(state: ValidationState, key: string, array: boolean): void {
	state.pathKeys.push(key);
	state.pathArrays.push(array);
}

function popValidationPath(state: ValidationState): void {
	state.pathKeys.pop();
	state.pathArrays.pop();
}

function formatValidationPath(state: ValidationState): string {
	let path = '$';
	for (let index = 0; index < state.pathKeys.length; index++) {
		const key = state.pathKeys[index]!;
		path += state.pathArrays[index] ? `[${key}]` : `.${key}`;
	}
	return path;
}
