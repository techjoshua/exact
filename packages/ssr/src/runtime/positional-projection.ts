import type { ExactValueSerializationSchema } from '@exactjs/core/framework/component-contracts';

/** Version-one traversal context supplied only to compiler-generated positional projectors. */
export interface PositionalProjectionContext {
	readonly active: Set<object>;
	readonly maxDepth: number;
	readonly maxNodes: number;
	nodes: number;
	readonly mismatch: symbol;
	readonly unsafe: symbol;
	validate(value: unknown, depth: number, state: PositionalProjectionContext): boolean;
	project(
		value: unknown,
		schema: readonly unknown[],
		index: number,
		depth: number,
		state: PositionalProjectionContext
	): unknown;
}

/** Compiler-owned function; it must guard the value before reading its declared properties. */
export type PositionalProjector = (
	value: Record<string, unknown>,
	depth: number,
	state: PositionalProjectionContext,
	schema: readonly unknown[],
	objectConstructor: ObjectConstructor,
	arrayConstructor: ArrayConstructor
) => unknown;

const projectors = new WeakMap<object, { version: number; project: PositionalProjector }>();

/**
 * Associates server-only generated code with an immutable schema without changing its tuple.
 * Unknown versions remain inert, allowing the ordinary interpreter to handle older components.
 */
export function registerPositionalProjector<T extends ExactValueSerializationSchema>(
	schema: T,
	version: number,
	project: PositionalProjector
): T {
	if (schema !== 0) projectors.set(schema, { version, project });
	return schema;
}

/** Reads only the supported traversal contract; absent or future versions use the interpreter. */
export function readPositionalProjector(
	schema: ExactValueSerializationSchema
): PositionalProjector | undefined {
	const entry = schema === 0 ? undefined : projectors.get(schema);
	return entry?.version === 1 ? entry.project : undefined;
}
