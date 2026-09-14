import type { ExactValueSerializationSchema } from '@exactjs/core/framework/component-contracts';

/** Active-path operations permitted by the initial version-one generated projector contract. */
export interface PositionalAncestors {
	/** Checks active ancestry, excluding already completed siblings. */
	has(value: object): boolean;
	/** Enters a container after its cycle check. */
	add(value: object): void;
	/** Leaves the most recently entered container on success or failure. */
	delete(value: object): boolean;
}

/** Shared traversal context; active ancestry exposes operations without requiring a native Set. */
export interface PositionalProjectionContext {
	readonly active: PositionalAncestors;
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
 * Unknown versions remain inert, allowing the ordinary interpreter to handle their schemas.
 */
export function registerPositionalProjector<T extends ExactValueSerializationSchema>(
	schema: T,
	version: number,
	project: PositionalProjector
): T {
	if (schema !== 0) projectors.set(schema, { version, project });
	return schema;
}

/** Reads supported emitted code without exposing the registry's mutable storage. */
export function readPositionalProjector(
	schema: ExactValueSerializationSchema
): PositionalProjector | undefined {
	const entry = schema === 0 ? undefined : projectors.get(schema);
	return entry?.version === 1 ? entry.project : undefined;
}
