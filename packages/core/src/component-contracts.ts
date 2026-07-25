import type { ContextToken } from './component/contracts.js';

/** Global property under which compiled artifacts carry their target-local contract. */
export const exactComponentContract = Symbol.for('@exactjs/component-contract');

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
}>;

/** Private operation contract attached to the component artifact that owns it. */
export type ExactComponentContinuationContract = Readonly<{
	id: string;
	componentId: string;
	dependencies: readonly Readonly<{
		source: 'state' | 'props' | 'derived';
	}>[];
	stateReads: readonly ExactContinuationStatePathContract[];
	stateWrites: readonly ExactContinuationStatePathContract[];
	publicContexts: readonly string[];
	serverContexts: readonly string[];
	contextWrites: readonly string[];
	boundaries: readonly string[];
}>;

/** Serializable activation record accepted by one generated server continuation. */
export type ExactComponentContinuationActivation = Readonly<{
	state: Record<string, unknown>;
	dependencies: readonly unknown[];
	publicContext: Readonly<Record<string, unknown>>;
}>;

/** Trusted invocation resources available only while a server continuation executes. */
export type ExactComponentContinuationExecution = Readonly<{
	signal: AbortSignal;
	getContext<T>(token: ContextToken<T>, authoredName?: string): T;
}>;

/** State accumulated by a generated continuation before write-contract projection. */
export type ExactComponentContinuationExecutionResult = Readonly<{
	state: Record<string, unknown>;
	contexts?: Readonly<Record<string, unknown>>;
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
	id: string;
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
};

/** Reads and validates compiler-attached metadata from one target-local component export. */
export function readExactComponentContract(
	component: (...args: any[]) => unknown
): ExactComponentContract | undefined {
	const contract = (component as ContractComponent)[exactComponentContract];
	if (!contract) return undefined;
	if (!isComponentContract(contract)) throw new Error('Unsupported eXact component contract');
	return contract;
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
		if (contract.role !== role)
			throw new Error(
				`Expected eXact ${role} component contract for ${contract.id}, received ${contract.role}`
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
function isComponentContract(value: unknown): value is ExactComponentContract {
	if (!isRecord(value)) return false;
	return (
		hasOnlyKeys(value, [
			'version',
			'id',
			'placement',
			'role',
			'implementations',
			'continuations',
			'executors',
			'boundaries',
			'resumption'
		]) &&
		value.version === 1 &&
		isString(value.id) &&
		(value.placement === 'client' ||
			value.placement === 'server' ||
			value.placement === 'isomorphic' ||
			value.placement === 'unknown') &&
		(value.role === 'client' || value.role === 'executor') &&
		Array.isArray(value.implementations) &&
		value.implementations.every(isImplementation) &&
		Array.isArray(value.continuations) &&
		value.continuations.every(isContinuation) &&
		Array.isArray(value.executors) &&
		value.executors.every(isExecutor) &&
		Array.isArray(value.boundaries) &&
		value.boundaries.every(isBoundary) &&
		(value.resumption === undefined || isResumption(value.resumption))
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
			'componentId',
			'dependencies',
			'stateReads',
			'stateWrites',
			'publicContexts',
			'serverContexts',
			'contextWrites',
			'boundaries'
		]) &&
		isString(value.id) &&
		isString(value.componentId) &&
		Array.isArray(value.dependencies) &&
		value.dependencies.every(isDependency) &&
		Array.isArray(value.stateReads) &&
		value.stateReads.every(isStatePath) &&
		Array.isArray(value.stateWrites) &&
		value.stateWrites.every(isStatePath) &&
		isSafeStringList(value.publicContexts) &&
		isSafeStringList(value.serverContexts) &&
		isSafeStringList(value.contextWrites) &&
		isSafeStringList(value.boundaries)
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
		(value.source === 'state' || value.source === 'props' || value.source === 'derived')
	);
}

/** Validates one state effect descriptor. */
function isStatePath(value: unknown): value is ExactContinuationStatePathContract {
	return (
		isRecord(value) &&
		hasOnlyKeys(value, ['path', 'kind', 'confidence']) &&
		isString(value.path) &&
		(value.kind === 'read' || value.kind === 'write') &&
		(value.confidence === 'exact' || value.confidence === 'broad' || value.confidence === 'unknown')
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
