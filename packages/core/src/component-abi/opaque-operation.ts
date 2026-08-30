/** Realm-stable identity marker for compiler-issued operations with WeakMap-private contents. */
export const exactOpaqueOperationIdentity = Symbol.for('@exactjs/opaque-target-operation');
const exactOpaqueOperationExecution = Symbol.for('@exactjs/opaque-target-operation-execution');
const exactOpaqueOperationMetadata = Symbol.for('@exactjs/opaque-target-operation-metadata');

import type { ComponentDomain } from '../component/contracts.js';

type ExactOpaqueOperationExecutor = (this: object, target: object) => unknown;

/** Reconciliation facts that remain independent of an operation's target-local payload. */
export type ExactOpaqueOperationMetadata = Readonly<{
	key?: string;
	domain?: ComponentDomain;
}>;

/** Returns one private redemption table shared by every copy of the core runtime in this realm. */
export function sharedOpaqueOperationStore<Data>(name: string): WeakMap<object, Data> {
	const key = Symbol.for(`@exactjs/opaque-target-operation-store/${name}`);
	const scope = globalThis as Record<PropertyKey, unknown>;
	const existing = scope[key];
	if (existing instanceof WeakMap) return existing as WeakMap<object, Data>;
	const store = new WeakMap<object, Data>();
	scope[key] = store;
	return store;
}

/** Allocates an immutable identity whose contents remain private to its issuing target protocol. */
export function createOpaqueOperation<Operation extends object>(
	execute?: ExactOpaqueOperationExecutor,
	metadata?: ExactOpaqueOperationMetadata
): Operation {
	const operation = Object.defineProperty({}, exactOpaqueOperationIdentity, { value: true });
	if (execute) Object.defineProperty(operation, exactOpaqueOperationExecution, { value: execute });
	if (metadata && (metadata.key !== undefined || metadata.domain !== undefined))
		Object.defineProperty(operation, exactOpaqueOperationMetadata, {
			value: Object.freeze({ ...metadata })
		});
	return Object.freeze(operation) as Operation;
}

/** Reports whether a value is a compiler-issued operation without redeeming its private payload. */
export function isOpaqueOperation(value: unknown): value is object {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as { [exactOpaqueOperationIdentity]?: unknown })[exactOpaqueOperationIdentity] === true
	);
}

/** Reads authored sibling identity without exposing an operation kind or target-local topology. */
export function opaqueOperationKey(value: unknown): string | undefined {
	return isOpaqueOperation(value)
		? (value as { [exactOpaqueOperationMetadata]?: ExactOpaqueOperationMetadata })[
				exactOpaqueOperationMetadata
			]?.key
		: undefined;
}

/** Reads component-domain ownership without exposing an operation kind or target-local topology. */
export function opaqueOperationDomain(value: unknown): ComponentDomain | undefined {
	return isOpaqueOperation(value)
		? (value as { [exactOpaqueOperationMetadata]?: ExactOpaqueOperationMetadata })[
				exactOpaqueOperationMetadata
			]?.domain
		: undefined;
}

/** Invokes one compiler-issued operation without reading a kind, payload, or child topology. */
export function executeOpaqueOperation<Result>(
	value: unknown,
	target: object
): Readonly<{ value: Result }> | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	const execute = (value as { [exactOpaqueOperationExecution]?: ExactOpaqueOperationExecutor })[
		exactOpaqueOperationExecution
	];
	return typeof execute === 'function'
		? { value: Reflect.apply(execute, value, [target]) as Result }
		: undefined;
}
