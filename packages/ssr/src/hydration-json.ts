import { normalizeProtocolLimit as positiveLimit } from '@exactjs/core/framework/protocol-records';

type ValidationState = {
	readonly active: Set<object>;
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
		structurallyKnown?: { has(value: object): boolean };
	}
): string | undefined {
	const state: ValidationState = {
		active: new Set(),
		structurallyKnown: limits.structurallyKnown,
		maxDepth: positiveLimit(limits.maxDepth, 100),
		maxNodes: positiveLimit(limits.maxNodes, 100_000),
		nodes: 0
	};
	try {
		return validateValue(value, '$', 0, state);
	} catch {
		return '$';
	}
}

function validateValue(
	value: unknown,
	path: string,
	depth: number,
	state: ValidationState
): string | undefined {
	if (++state.nodes > state.maxNodes || depth > state.maxDepth) return path;
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return undefined;
	if (typeof value === 'number') return Number.isFinite(value) ? undefined : path;
	if (typeof value !== 'object' || state.active.has(value)) return path;
	if (
		!state.structurallyKnown?.has(value) &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) !== Object.prototype
	)
		return path;
	state.active.add(value);
	try {
		return validateContainer(value, path, depth, state);
	} finally {
		state.active.delete(value);
	}
}

function validateContainer(
	source: object,
	path: string,
	depth: number,
	state: ValidationState
): string | undefined {
	const array = Array.isArray(source);
	const structurallyKnown = state.structurallyKnown?.has(source) ?? false;
	for (const key of Object.keys(source)) {
		const itemPath = `${path}${array ? `[${key}]` : `.${key}`}`;
		if (structurallyKnown) {
			const unsafePath = validateValue(
				(source as Record<string, unknown>)[key],
				itemPath,
				depth + 1,
				state
			);
			if (unsafePath) return unsafePath;
			continue;
		}
		const descriptor = Object.getOwnPropertyDescriptor(source, key);
		if (!descriptor || !('value' in descriptor)) return itemPath;
		const unsafePath = validateValue(descriptor.value, itemPath, depth + 1, state);
		if (unsafePath) return unsafePath;
	}
	return undefined;
}
