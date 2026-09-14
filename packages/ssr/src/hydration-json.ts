import type { ExactValueSerializationSchema } from '@exactjs/core/framework/component-contracts';
import { normalizeProtocolLimit as positiveLimit } from '@exactjs/core/framework/protocol-records';
import type { PositionalRootPublication } from './render/root-props.js';
import type { SsrSerializedResumption } from './resumption.js';
import {
	readPositionalProjector,
	type PositionalProjectionContext
} from './runtime/positional-projection.js';

/**
 * Compiler-owned container shape carried only until traversal reaches an authored value.
 *
 * `1` is the envelope, followed by the resumption list, record, indexed-entry list, indexed entry,
 * and settled-continuation list as `2` through `6`. Shape `0` always takes the descriptor-safe
 * authored-value path.
 */
type DirectHydrationShape = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type ValidationState = Omit<PositionalProjectionContext, 'active'> & {
	active: PositionalProjectionContext['active'];
	readonly onValidatedArray?: (value: unknown[]) => void;
	readonly path?: ValidationPath;
	readonly positionalRoot?: PositionalRootPublication;
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

/** Tracks shallow request-local ancestry without allocating and rehashing a Set's buckets. */
class HydrationAncestors {
	readonly values: object[] = [];

	/** Tests only the active traversal path; shared siblings are not cycles. */
	has(value: object): boolean {
		return this.values.includes(value);
	}

	/** Records a container after the validator has excluded active-path duplicates. */
	add(value: object): void {
		this.values.push(value);
	}

	/** Unwinds the most recently entered container, including early validation failures. */
	delete(value: object): boolean {
		if (this.values[this.values.length - 1] !== value)
			throw new Error('Unbalanced hydration ancestor');
		this.values.pop();
		return true;
	}
}

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
		positionalRoot?: PositionalRootPublication;
	}
): string | undefined {
	const state: ValidationState = {
		active: new HydrationAncestors(),
		directResumptions: limits.directResumptions,
		positionalRoot: limits.positionalRoot,
		structurallyKnown: limits.structurallyKnown,
		structurallyKnownRoot: limits.structurallyKnownRoot,
		maxDepth: positiveLimit(limits.maxDepth, 100),
		maxNodes: positiveLimit(limits.maxNodes, 100_000),
		validate: validateValue,
		project: projectPositionalField,
		mismatch: positionalMismatch,
		unsafe: positionalUnsafe,
		onValidatedArray: limits.onValidatedArray,
		nodes: 0
	};
	try {
		if (validateValue(value, 0, state, value === state.structurallyKnownRoot ? 1 : 0))
			return undefined;
		const diagnostic: ValidationState = {
			...state,
			active: new HydrationAncestors(),
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
	// Bound linear ancestor lookup for deeper graphs while preserving the complete active path.
	if (state.active instanceof HydrationAncestors && state.active.values.length >= 16)
		state.active = new Set(state.active.values);
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
	if (shape === 1 && array) return validateDirectEnvelope(source as unknown[], depth, state);
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
			if (shape === 1 && key === 'state' && state.positionalRoot) {
				const publication = state.positionalRoot;
				const encoded = validatePositionalValue(
					publication.props,
					publication.schema,
					depth + 2,
					state
				);
				if (encoded === positionalUnsafe) return false;
				if (encoded === positionalMismatch) {
					(source as Record<string, unknown>)[key] = publication.props;
					if (!validateValue(publication.props, depth + 1, state)) return false;
				} else {
					if (depth + 1 > state.maxDepth || state.nodes + 2 > state.maxNodes) return false;
					state.nodes += 2;
					(source as Record<string, unknown>)[key] = [publication.componentId, encoded];
				}
				if (path) popValidationPath(path);
				continue;
			}
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

/**
 * Validates the versioned compiler-direct envelope and rewrites only compiler-proven positional
 * values. The field mask is protocol data rather than application input: unknown bits, missing
 * values, and trailing values all fail closed before publication.
 */
function validateDirectEnvelope(source: unknown[], depth: number, state: ValidationState): boolean;
function validateDirectEnvelope(source: unknown[], depth: number, state: ValidationState): boolean {
	const version = source[0];
	const mask = source[1];
	if (
		version !== 1 ||
		typeof mask !== 'number' ||
		!Number.isSafeInteger(mask) ||
		mask < 0 ||
		(mask & ~16_383) !== 0
	)
		return false;
	if (state.nodes + 2 > state.maxNodes || depth + 1 > state.maxDepth) return false;
	state.nodes += 2;
	let index = 2;
	let remaining = mask & ~16;
	while (remaining !== 0) {
		const bit = remaining & -remaining;
		remaining &= remaining - 1;
		if (index >= source.length) return false;
		if (state.path) pushValidationPath(state.path, String(index), true);
		const item = source[index];
		if (bit === 8 && state.positionalRoot) {
			const publication = state.positionalRoot;
			const encoded = validatePositionalValue(
				publication.props,
				publication.schema,
				depth + 2,
				state
			);
			if (encoded === positionalUnsafe) return false;
			if (encoded === positionalMismatch) {
				source[index] = publication.props;
				if (!validateValue(publication.props, depth + 1, state)) return false;
			} else {
				if (depth + 1 > state.maxDepth || state.nodes + 2 > state.maxNodes) return false;
				state.nodes += 2;
				source[index] = [publication.componentId, encoded];
			}
		} else {
			const childShape: DirectHydrationShape =
				bit === 64 && item === state.directResumptions ? 2 : 0;
			if (!validateValue(item, depth + 1, state, childShape)) return false;
		}
		if (state.path) popValidationPath(state.path);
		index++;
	}
	return index === source.length;
}

const positionalMismatch = Symbol('positional-mismatch');
const positionalUnsafe = Symbol('positional-unsafe');

/** Dispatches a generated field through its compiler-owned nested schema. */
function projectPositionalField(
	value: unknown,
	schema: readonly unknown[],
	index: number,
	depth: number,
	state: PositionalProjectionContext
): unknown {
	return validatePositionalValue(
		value,
		schema[index] as ExactValueSerializationSchema,
		depth,
		state
	);
}

/**
 * Reads compiler-declared fields once while constructing their final positional cells.
 *
 * The schema fixes every visited key and the output contains only newly created arrays, so normal
 * property access is sufficient here. Generic values outside this compiler-owned conversion keep
 * the descriptor-safe validation path.
 */
function validatePositionalValue(
	value: unknown,
	schema: ExactValueSerializationSchema,
	depth: number,
	state: ValidationState
): unknown | typeof positionalMismatch | typeof positionalUnsafe {
	if (schema === 0) {
		// Primitive cells need the same budgets and JSON rules, but no container traversal.
		if (value === null || typeof value !== 'object') {
			if (++state.nodes > state.maxNodes || depth > state.maxDepth) return positionalUnsafe;
			return value === null ||
				typeof value === 'string' ||
				typeof value === 'boolean' ||
				(typeof value === 'number' && Number.isFinite(value))
				? value
				: positionalUnsafe;
		}
		return validateValue(value, depth, state) ? value : positionalUnsafe;
	}
	if (++state.nodes > state.maxNodes || depth > state.maxDepth) return positionalUnsafe;
	if (!value || typeof value !== 'object' || state.active.has(value)) return positionalMismatch;
	if (state.active instanceof HydrationAncestors && state.active.values.length >= 16)
		state.active = new Set(state.active.values);
	state.active.add(value);
	try {
		if (schema[0] === 2) {
			if (
				!Array.isArray(value) ||
				Object.getPrototypeOf(value) !== Array.prototype ||
				Object.keys(value).length !== value.length
			)
				return positionalMismatch;
			const output = new Array<unknown>(value.length);
			const projector =
				value.length >= 16 && !state.path ? readPositionalProjector(schema[1]) : undefined;
			if (projector) {
				for (let index = 0; index < value.length; index++) {
					if (!Object.hasOwn(value, index)) return positionalMismatch;
					const encoded = projector(
						value[index],
						depth + 1,
						state as PositionalProjectionContext,
						schema[1] as readonly unknown[],
						Object,
						Array
					);
					if (encoded === positionalMismatch || encoded === positionalUnsafe) return encoded;
					output[index] = encoded;
				}
				return output;
			}
			for (let index = 0; index < value.length; index++) {
				if (!Object.hasOwn(value, index)) return positionalMismatch;
				if (state.path) pushValidationPath(state.path, String(index), true);
				const encoded = validatePositionalValue(value[index], schema[1], depth + 1, state);
				if (encoded === positionalMismatch || encoded === positionalUnsafe) return encoded;
				output[index] = encoded;
				if (state.path) popValidationPath(state.path);
			}
			return output;
		}
		if (Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype)
			return positionalMismatch;
		const fieldCount = (schema.length - 1) / 2;
		if (Object.keys(value).length !== fieldCount) return positionalMismatch;
		const output = new Array<unknown>(fieldCount);
		for (let schemaIndex = 1, outputIndex = 0; schemaIndex < schema.length; schemaIndex += 2) {
			const field = schema[schemaIndex] as string;
			// Earlier field getters can change ownership after the shape's keys were enumerated.
			if (!Object.hasOwn(value, field)) return positionalMismatch;
			if (state.path) pushValidationPath(state.path, field, false);
			const encoded = validatePositionalValue(
				(value as Record<string, unknown>)[field],
				schema[schemaIndex + 1] as ExactValueSerializationSchema,
				depth + 1,
				state
			);
			if (encoded === positionalMismatch || encoded === positionalUnsafe) return encoded;
			output[outputIndex++] = encoded;
			if (state.path) popValidationPath(state.path);
		}
		return output;
	} finally {
		state.active.delete(value);
	}
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
