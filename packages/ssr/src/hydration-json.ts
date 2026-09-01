import { normalizeProtocolLimit as positiveLimit } from '@exactjs/core/framework/protocol-records';
import type { SsrSerializedResumption } from './resumption.js';

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
		if (validateValue(value, 0, state)) return undefined;
		const diagnostic: ValidationState = {
			...state,
			active: new Set(),
			onValidatedArray: undefined,
			path: { arrays: [], keys: [] },
			nodes: 0
		};
		return validateValue(value, 0, diagnostic) ? '$' : formatValidationPath(diagnostic.path!);
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
		value !== state.structurallyKnownRoot &&
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
	if (source === state.directResumptions)
		return validateDirectResumptions(state.directResumptions, depth, state);
	const array = Array.isArray(source);
	const structurallyKnown =
		source === state.structurallyKnownRoot || (state.structurallyKnown?.has(source) ?? false);
	const path = state.path;
	if (array && structurallyKnown) {
		for (let index = 0; index < source.length; index++) {
			if (path) pushValidationPath(path, String(index), true);
			if (!validateValue(source[index], depth + 1, state)) return false;
			if (path) popValidationPath(path);
		}
		state.onValidatedArray?.(source);
		return true;
	}
	for (const key of Object.keys(source)) {
		if (path) pushValidationPath(path, key, array);
		if (structurallyKnown) {
			if (!validateValue((source as Record<string, unknown>)[key], depth + 1, state)) return false;
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

/** Traverses compiler-owned tuple structure while retaining generic validation for authored values. */
function validateDirectResumptions(
	resumptions: readonly SsrSerializedResumption[],
	depth: number,
	state: ValidationState
): boolean {
	for (let recordIndex = 0; recordIndex < resumptions.length; recordIndex++) {
		const record = resumptions[recordIndex]!;
		const path = state.path;
		if (path) pushValidationPath(path, String(recordIndex), true);
		if (!validateDirectResumption(record, depth + 1, state)) return false;
		if (path) popValidationPath(path);
	}
	return true;
}

function validateDirectResumption(
	record: SsrSerializedResumption,
	depth: number,
	state: ValidationState
): boolean {
	if (!enterKnownContainer(record as object, depth, state)) return false;
	try {
		if (!validateIndexedValue(record[0], '0', depth, state)) return false;
		if (!validateOptionalDirectEntries(record[1], '1', depth, state)) return false;
		if (!validateOptionalDirectEntries(record[2], '2', depth, state)) return false;
		const settled = record[3];
		if (settled) {
			const path = state.path;
			if (path) pushValidationPath(path, '3', true);
			if (!validateDirectSettled(settled, depth + 1, state)) return false;
			if (path) popValidationPath(path);
		}
		return true;
	} finally {
		state.active.delete(record as object);
	}
}

function validateOptionalDirectEntries(
	entries: SsrSerializedResumption[1],
	index: string,
	depth: number,
	state: ValidationState
): boolean {
	if (!entries) return true;
	const path = state.path;
	if (path) pushValidationPath(path, index, true);
	if (!validateDirectEntries(entries, depth + 1, state)) return false;
	if (path) popValidationPath(path);
	return true;
}

function validateDirectEntries(
	entries: NonNullable<SsrSerializedResumption[1]>,
	depth: number,
	state: ValidationState
): boolean {
	if (!enterKnownContainer(entries as object, depth, state)) return false;
	try {
		for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
			const entry = entries[entryIndex]!;
			const path = state.path;
			if (path) pushValidationPath(path, String(entryIndex), true);
			if (!validateDirectEntry(entry, depth + 1, state)) return false;
			if (path) popValidationPath(path);
		}
		return true;
	} finally {
		state.active.delete(entries as object);
	}
}

function validateDirectEntry(
	entry: NonNullable<SsrSerializedResumption[1]>[number],
	depth: number,
	state: ValidationState
): boolean {
	if (!enterKnownContainer(entry as object, depth, state)) return false;
	try {
		return (
			validateIndexedValue(entry[0], '0', depth, state) &&
			validateIndexedValue(entry[1], '1', depth, state)
		);
	} finally {
		state.active.delete(entry as object);
	}
}

function validateDirectSettled(
	settled: NonNullable<SsrSerializedResumption[3]>,
	depth: number,
	state: ValidationState
): boolean {
	if (!enterKnownContainer(settled as object, depth, state)) return false;
	try {
		for (let index = 0; index < settled.length; index++) {
			if (!validateIndexedValue(settled[index], String(index), depth, state)) return false;
		}
		return true;
	} finally {
		state.active.delete(settled as object);
	}
}

function enterKnownContainer(value: object, depth: number, state: ValidationState): boolean {
	if (++state.nodes > state.maxNodes || depth > state.maxDepth || state.active.has(value))
		return false;
	state.active.add(value);
	return true;
}

function validateIndexedValue(
	value: unknown,
	index: string,
	depth: number,
	state: ValidationState
): boolean {
	const path = state.path;
	if (path) pushValidationPath(path, index, true);
	if (!validateValue(value, depth + 1, state)) return false;
	if (path) popValidationPath(path);
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
