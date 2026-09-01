import { normalizeProtocolLimit as positiveLimit } from '@exactjs/core/framework/protocol-records';
import type { SsrSerializedResumption } from './resumption.js';

/**
 * Compiler-owned container shape carried only until traversal reaches an authored value.
 *
 * `1` is the envelope, followed by the resumption list, record, indexed-entry list, indexed entry,
 * and settled-continuation list as `2` through `6`. Shape `0` always takes the descriptor-safe
 * authored-value path.
 */
type DirectHydrationShape = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type ValidationState = {
	readonly active: Set<object>;
	readonly onValidatedArray?: (value: unknown[]) => void;
	readonly path?: ValidationPath;
	readonly directResumptions?: readonly SsrSerializedResumption[];
	readonly structurallyKnown?: { has(value: object): boolean };
	readonly structurallyKnownRoot?: object;
	readonly maxDepth: number;
	readonly maxNodes: number;
	nodes: number;
};

type ValidationPath = {
	readonly arrays: boolean[];
	readonly keys: string[];
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
		directResumptions?: readonly SsrSerializedResumption[];
		structurallyKnown?: { has(value: object): boolean };
		structurallyKnownRoot?: object;
	}
): string | undefined {
	const state: ValidationState = {
		active: new Set(),
		directResumptions: limits.directResumptions,
		structurallyKnown: limits.structurallyKnown,
		structurallyKnownRoot: limits.structurallyKnownRoot,
		maxDepth: positiveLimit(limits.maxDepth, 100),
		maxNodes: positiveLimit(limits.maxNodes, 100_000),
		onValidatedArray: limits.onValidatedArray,
		nodes: 0
	};
	try {
		if (validateValue(value, 0, state, value === state.structurallyKnownRoot ? 1 : 0))
			return undefined;
		const diagnostic: ValidationState = {
			...state,
			active: new Set(),
			onValidatedArray: undefined,
			path: { arrays: [], keys: [] },
			nodes: 0
		};
		return validateValue(value, 0, diagnostic, value === state.structurallyKnownRoot ? 1 : 0)
			? '$'
			: formatValidationPath(diagnostic.path!);
	} catch {
		return '$';
	}
}

function validateValue(
	value: unknown,
	depth: number,
	state: ValidationState,
	shape: DirectHydrationShape = 0
): boolean {
	if (++state.nodes > state.maxNodes || depth > state.maxDepth) return false;
	if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
	if (typeof value === 'number') return Number.isFinite(value);
	if (typeof value !== 'object' || state.active.has(value)) return false;
	if (
		shape === 0 &&
		!state.structurallyKnown?.has(value) &&
		!Array.isArray(value) &&
		Object.getPrototypeOf(value) !== Object.prototype
	)
		return false;
	state.active.add(value);
	try {
		return validateContainer(value, depth, state, shape);
	} finally {
		state.active.delete(value);
	}
}

function validateContainer(
	source: object,
	depth: number,
	state: ValidationState,
	shape: DirectHydrationShape
): boolean {
	const array = Array.isArray(source);
	const structurallyKnown = shape !== 0 || (state.structurallyKnown?.has(source) ?? false);
	const path = state.path;
	if (shape >= 2 && !array) return false;
	if (array && structurallyKnown) {
		for (let index = 0; index < source.length; index++) {
			if (path) pushValidationPath(path, String(index), true);
			const childShape: DirectHydrationShape =
				shape === 2
					? 3
					: shape === 4
						? 5
						: shape === 3 && (index === 1 || index === 2)
							? 4
							: shape === 3 && index === 3
								? 6
								: 0;
			if (!validateValue(source[index], depth + 1, state, childShape)) return false;
			if (path) popValidationPath(path);
		}
		if (shape === 0) state.onValidatedArray?.(source);
		return true;
	}
	for (const key of Object.keys(source)) {
		if (path) pushValidationPath(path, key, array);
		if (structurallyKnown) {
			const item = (source as Record<string, unknown>)[key];
			const childShape: DirectHydrationShape =
				shape === 1 && key === 'resumptions' && item === state.directResumptions ? 2 : 0;
			if (!validateValue(item, depth + 1, state, childShape)) return false;
			if (path) popValidationPath(path);
			continue;
		}
		const descriptor = Object.getOwnPropertyDescriptor(source, key);
		if (!descriptor || !('value' in descriptor)) return false;
		if (!validateValue(descriptor.value, depth + 1, state)) return false;
		if (path) popValidationPath(path);
	}
	if (array) state.onValidatedArray?.(source as unknown[]);
	return true;
}

function pushValidationPath(path: ValidationPath, key: string, array: boolean): void {
	path.keys.push(key);
	path.arrays.push(array);
}

function popValidationPath(path: ValidationPath): void {
	path.keys.pop();
	path.arrays.pop();
}

function formatValidationPath(pathValue: ValidationPath): string {
	let path = '$';
	for (let index = 0; index < pathValue.keys.length; index++) {
		const key = pathValue.keys[index]!;
		path += pathValue.arrays[index] ? `[${key}]` : `.${key}`;
	}
	return path;
}
