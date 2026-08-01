import type { ContextToken } from './component/contracts.js';
import type { TaskContext } from './tasks/contracts.js';

/** Global property under which compiled artifacts carry their target-local contract. */
export const exactComponentContract = Symbol.for('@exactjs/component-contract');

/** Global marker distinguishing a native eXact component from compatibility-owned functions. */
export const exactComponentType = Symbol.for('@exactjs/component');

/** One executable implementation owned by a compiled component artifact. */
export type ExactComponentImplementationContract = Readonly<{
	id: string;
	name: string;
	role: 'root' | 'client-island' | 'server-part';
	implementation: (...args: any[]) => any;
}>;

/** Runtime-neutral state path used by a generated continuation contract. */
export type ExactContinuationStatePathContract = Readonly<{
	path: string;
	kind: 'read' | 'write';
	confidence: 'exact' | 'broad' | 'unknown';
	operation?: 'value' | 'map' | 'set';
}>;

/** One ordered Map or Set mutation returned by a server continuation. */
export type ExactCollectionMutation =
	| Readonly<{ path: string; operation: 'map-set'; key: unknown; value: unknown }>
	| Readonly<{ path: string; operation: 'map-delete'; key: unknown }>
	| Readonly<{ path: string; operation: 'map-clear' }>
	| Readonly<{ path: string; operation: 'set-add'; value: unknown }>
	| Readonly<{ path: string; operation: 'set-delete'; value: unknown }>
	| Readonly<{ path: string; operation: 'set-clear' }>;

/** Private operation contract attached to the component artifact that owns it. */
export type ExactComponentContinuationContract = Readonly<{
	id: string;
	kind: 'task';
	componentId: string;
	readiness: 'blocking' | 'nonblocking';
	dependencies: readonly Readonly<{
		source: 'state' | 'props' | 'derived' | 'argument';
	}>[];
	invocation?: Readonly<{
		arguments: readonly Readonly<{ source: 'argument' }>[];
		concurrency: 'parallel' | 'latest' | 'queue';
	}>;
	stateReads: readonly ExactContinuationStatePathContract[];
	stateWrites: readonly ExactContinuationStatePathContract[];
	publicContexts: readonly string[];
	serverContexts: readonly string[];
	contextWrites: readonly string[];
	/** Server-owned context mutations which never enter the client response. */
	serverContextWrites?: readonly string[];
	boundaries: readonly string[];
}>;

/** Serializable activation record accepted by one generated server continuation. */
export type ExactComponentContinuationActivation = Readonly<{
	state: Record<string, unknown>;
	dependencies: readonly unknown[];
	publicContext: Readonly<Record<string, unknown>>;
	generation?: number;
}>;

/** Trusted invocation resources available only while a server continuation executes. */
export type ExactComponentContinuationExecution = Readonly<{
	task: TaskContext;
	signal: AbortSignal;
	getContext<T>(token: ContextToken<T>, authoredName?: string): T;
	setContext<T>(token: ContextToken<T>, value: T, authoredName?: string): void;
}>;

/** State accumulated by a generated continuation before write-contract projection. */
export type ExactComponentContinuationExecutionResult = Readonly<{
	state: Record<string, unknown>;
	contexts?: Readonly<Record<string, unknown>>;
	value?: unknown;
}>;

/** Executable server half paired with one inert continuation descriptor. */
export type ExactComponentContinuationExecutorContract = Readonly<{
	id: string;
	componentId: string;
	execute(
		activation: ExactComponentContinuationActivation,
		execution: ExactComponentContinuationExecution
	): ExactComponentContinuationExecutionResult | Promise<ExactComponentContinuationExecutionResult>;
}>;

/** One compiler-owned DOM boundary and its component ownership. */
export type ExactComponentBoundaryContract = Readonly<{
	id: string;
	componentId: string;
	ownerComponentId: string;
	kind: string;
}>;

/** Minimum browser-visible values required to resume one SSR component. */
export type ExactComponentResumptionContract = Readonly<{
	componentId: string;
	statePaths: readonly string[];
	valueCaptures: readonly string[];
	contexts: readonly string[];
	boundaries: readonly string[];
}>;

/** Target-local executable contract attached to a public component root. */
export type ExactComponentContract = Readonly<{
	version: 1;
	placement: 'client' | 'server' | 'isomorphic' | 'unknown';
	role: 'client' | 'executor';
	implementations: readonly ExactComponentImplementationContract[];
	continuations: readonly ExactComponentContinuationContract[];
	executors: readonly ExactComponentContinuationExecutorContract[];
	boundaries: readonly ExactComponentBoundaryContract[];
	resumption?: ExactComponentResumptionContract;
}>;

/** Composed target-local contracts indexed for runtime use. */
export type ExactComposedComponentContracts = Readonly<{
	implementations: Record<string, (...args: any[]) => any>;
	implementationsById: Record<string, (...args: any[]) => any>;
	continuations: Record<string, ExactComponentContinuationContract>;
	executors: Record<string, ExactComponentContinuationExecutorContract>;
	boundaries: Record<string, ExactComponentBoundaryContract>;
	resumptions: Record<string, ExactComponentResumptionContract>;
}>;

type ContractComponent = ((...args: any[]) => any) & {
	[exactComponentContract]?: ExactComponentContract;
	[exactComponentType]?: string;
};

/** Brands a compilerless framework component with an explicit stable native identity. */
export function markExactComponent<T extends (...args: any[]) => any>(
	component: T,
	identity: string
): T {
	if (!identity) throw new Error('eXact component identity must be a non-empty string');
	Object.defineProperty(component, exactComponentType, {
		configurable: false,
		enumerable: false,
		value: identity,
		writable: false
	});
	return component;
}

/** Returns whether a callable carries a valid native eXact component identity. */
export function isExactComponent(component: unknown): component is (...args: any[]) => unknown {
	if (typeof component !== 'function') return false;
	const identity = (component as ContractComponent)[exactComponentType];
	return typeof identity === 'string' && identity.length > 0;
}

/** Reads and validates compiler-attached metadata from one target-local component export. */
export function readExactComponentContract(
	component: (...args: any[]) => unknown
): ExactComponentContract | undefined {
	const contract = (component as ContractComponent)[exactComponentContract];
	if (!contract) return undefined;
	const componentId = exactComponentIdentity(component);
	if (!isComponentContract(contract, componentId))
		throw new Error('Unsupported eXact component contract');
	return contract;
}

/** Returns the stable compiler identity used to pair SSR and client component boundaries. */
export function exactComponentIdentity(component: (...args: any[]) => unknown): string {
	const identity = (component as ContractComponent)[exactComponentType];
	if (typeof identity === 'string' && identity) return identity;
	throw new Error('Native eXact components require compiler-owned identity');
}

/**
 * Composes imported component contracts into duplicate-checked runtime indexes.
 *
 * Importing the component is the activation boundary: only implementations and
 * operations reachable from the supplied roots enter the result.
 */
export function composeExactComponentContracts(
	components: readonly ((...args: any[]) => any)[],
	role: ExactComponentContract['role']
): ExactComposedComponentContracts {
	const implementations: Record<string, (...args: any[]) => any> = {};
	const implementationsById: Record<string, (...args: any[]) => any> = {};
	const continuations: Record<string, ExactComponentContinuationContract> = {};
	const executors: Record<string, ExactComponentContinuationExecutorContract> = {};
	const boundaries: Record<string, ExactComponentBoundaryContract> = {};
	const resumptions: Record<string, ExactComponentResumptionContract> = {};

	for (const component of components) {
		const contract = readExactComponentContract(component);
		if (!contract) continue;
		const componentId = exactComponentIdentity(component);
		if (contract.role !== role)
			throw new Error(
				`Expected eXact ${role} component contract for ${componentId}, received ${contract.role}`
			);
		for (const implementation of contract.implementations) {
			addUniqueImplementation(
				implementationsById,
				implementation.id,
				implementation.implementation
			);
			addUniqueImplementation(implementations, implementation.name, implementation.implementation);
		}
		for (const continuation of contract.continuations)
			addUniqueJson(continuations, continuation.id, continuation, 'continuation');
		for (const executor of contract.executors) addUniqueExecutor(executors, executor);
		for (const boundary of contract.boundaries)
			addUniqueJson(boundaries, boundary.id, boundary, 'boundary');
		if (contract.resumption)
			addUniqueJson(
				resumptions,
				contract.resumption.componentId,
				contract.resumption,
				'resumption'
			);
	}

	return Object.freeze({
		implementations,
		implementationsById,
		continuations,
		executors,
		boundaries,
		resumptions
	});
}

/** Adds one generated continuation implementation while rejecting ambiguous authority. */
function addUniqueExecutor(
	target: Record<string, ExactComponentContinuationExecutorContract>,
	executor: ExactComponentContinuationExecutorContract
): void {
	const previous = target[executor.id];
	if (
		previous &&
		(previous.componentId !== executor.componentId || previous.execute !== executor.execute)
	)
		throw new Error(`Conflicting eXact component continuation executor ${executor.id}`);
	target[executor.id] = executor;
}

/** Adds one implementation while rejecting ID or runtime-name collisions. */
function addUniqueImplementation(
	target: Record<string, (...args: any[]) => any>,
	key: string,
	implementation: (...args: any[]) => any
): void {
	const previous = target[key];
	if (previous && previous !== implementation)
		throw new Error(`Conflicting eXact component implementation ${key}`);
	target[key] = implementation;
}

/** Adds immutable JSON-shaped metadata while rejecting conflicting identities. */
function addUniqueJson<T>(target: Record<string, T>, key: string, value: T, kind: string): void {
	const previous = target[key];
	if (previous && JSON.stringify(previous) !== JSON.stringify(value))
		throw new Error(`Conflicting eXact component ${kind} ${key}`);
	target[key] = value;
}

/** Validates all required metadata before a generated artifact gains runtime authority. */
function isComponentContract(value: unknown, componentId: string): value is ExactComponentContract {
	if (!isRecord(value)) return false;
	return (
		hasOnlyKeys(value, [
			'version',
			'placement',
			'role',
			'implementations',
			'continuations',
			'executors',
			'boundaries',
			'resumption'
		]) &&
		value.version === 1 &&
		(value.placement === 'client' ||
			value.placement === 'server' ||
			value.placement === 'isomorphic' ||
			value.placement === 'unknown') &&
		(value.role === 'client' || value.role === 'executor') &&
		Array.isArray(value.implementations) &&
		value.implementations.every(isImplementation) &&
		Array.isArray(value.continuations) &&
		value.continuations.every(
			(continuation) => isContinuation(continuation) && continuation.componentId === componentId
		) &&
		Array.isArray(value.executors) &&
		value.executors.every(
			(executor) => isExecutor(executor) && executor.componentId === componentId
		) &&
		Array.isArray(value.boundaries) &&
		value.boundaries.every(
			(boundary) => isBoundary(boundary) && boundary.componentId === componentId
		) &&
		(value.resumption === undefined ||
			(isResumption(value.resumption) && value.resumption.componentId === componentId))
	);
}

/** Validates one executable implementation descriptor. */
function isImplementation(value: unknown): value is ExactComponentImplementationContract {
	if (!isRecord(value)) return false;
	return (
		hasOnlyKeys(value, ['id', 'name', 'role', 'implementation']) &&
		isString(value.id) &&
		isString(value.name) &&
		(value.role === 'root' || value.role === 'client-island' || value.role === 'server-part') &&
		typeof value.implementation === 'function'
	);
}

/** Validates one browser-visible continuation allowlist. */
function isContinuation(value: unknown): value is ExactComponentContinuationContract {
	if (!isRecord(value)) return false;
	return (
		hasOnlyKeys(value, [
			'id',
			'kind',
			'componentId',
			'readiness',
			'dependencies',
			'stateReads',
			'stateWrites',
			'publicContexts',
			'serverContexts',
			'contextWrites',
			'serverContextWrites',
			'boundaries',
			'invocation'
		]) &&
		isString(value.id) &&
		value.kind === 'task' &&
		isString(value.componentId) &&
		(value.readiness === 'blocking' || value.readiness === 'nonblocking') &&
		Array.isArray(value.dependencies) &&
		value.dependencies.every(isDependency) &&
		Array.isArray(value.stateReads) &&
		value.stateReads.every(isStatePath) &&
		Array.isArray(value.stateWrites) &&
		value.stateWrites.every(isStatePath) &&
		isSafeStringList(value.publicContexts) &&
		isSafeStringList(value.serverContexts) &&
		isSafeStringList(value.contextWrites) &&
		(value.serverContextWrites === undefined || isSafeStringList(value.serverContextWrites)) &&
		isSafeStringList(value.boundaries) &&
		(value.invocation === undefined || isInvocation(value.invocation))
	);
}

/** Validates direct-invocation metadata attached to a task continuation. */
function isInvocation(value: unknown): boolean {
	if (!isRecord(value)) return false;
	return (
		hasOnlyKeys(value, ['arguments', 'concurrency']) &&
		Array.isArray(value.arguments) &&
		value.arguments.every(
			(argument) =>
				isRecord(argument) && hasOnlyKeys(argument, ['source']) && argument.source === 'argument'
		) &&
		(value.concurrency === 'parallel' ||
			value.concurrency === 'latest' ||
			value.concurrency === 'queue')
	);
}

/** Validates one server executor descriptor. */
function isExecutor(value: unknown): value is ExactComponentContinuationExecutorContract {
	if (!isRecord(value)) return false;
	return (
		hasOnlyKeys(value, ['id', 'componentId', 'execute']) &&
		isString(value.id) &&
		isString(value.componentId) &&
		typeof value.execute === 'function'
	);
}

/** Validates one generated DOM boundary descriptor. */
function isBoundary(value: unknown): value is ExactComponentBoundaryContract {
	if (!isRecord(value)) return false;
	return (
		hasOnlyKeys(value, ['id', 'componentId', 'ownerComponentId', 'kind']) &&
		isString(value.id) &&
		isString(value.componentId) &&
		isString(value.ownerComponentId) &&
		isString(value.kind)
	);
}

/** Validates one browser resumption allowlist. */
function isResumption(value: unknown): value is ExactComponentResumptionContract {
	if (!isRecord(value)) return false;
	return (
		hasOnlyKeys(value, ['componentId', 'statePaths', 'valueCaptures', 'contexts', 'boundaries']) &&
		isString(value.componentId) &&
		isSafeStringList(value.statePaths) &&
		isSafeStringList(value.valueCaptures) &&
		isSafeStringList(value.contexts) &&
		isSafeStringList(value.boundaries)
	);
}

/** Validates one transported dependency source descriptor. */
function isDependency(value: unknown): boolean {
	return (
		isRecord(value) &&
		hasOnlyKeys(value, ['source']) &&
		(value.source === 'state' ||
			value.source === 'props' ||
			value.source === 'derived' ||
			value.source === 'argument')
	);
}

/** Validates one state effect descriptor. */
function isStatePath(value: unknown): value is ExactContinuationStatePathContract {
	return (
		isRecord(value) &&
		hasOnlyKeys(value, ['path', 'kind', 'confidence', 'operation']) &&
		isString(value.path) &&
		(value.kind === 'read' || value.kind === 'write') &&
		(value.confidence === 'exact' ||
			value.confidence === 'broad' ||
			value.confidence === 'unknown') &&
		(value.operation === undefined ||
			value.operation === 'value' ||
			value.operation === 'map' ||
			value.operation === 'set')
	);
}

/** Validates non-empty names without prototype-bearing dictionary keys. */
function isSafeStringList(value: unknown): value is string[] {
	return (
		Array.isArray(value) &&
		value.every(
			(item) =>
				isString(item) && item !== '__proto__' && item !== 'prototype' && item !== 'constructor'
		)
	);
}

/** Narrows a generated metadata value to a non-array record. */
function isRecord(value: unknown): value is Record<string, any> {
	return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Requires stable generated names to be non-empty. */
function isString(value: unknown): value is string {
	return typeof value === 'string' && value.length > 0;
}

/** Rejects missing and unexpected fields in versioned generated metadata. */
function hasOnlyKeys(value: Record<string, any>, allowed: readonly string[]): boolean {
	const keys = Object.keys(value);
	return keys.every((key) => allowed.includes(key));
}
