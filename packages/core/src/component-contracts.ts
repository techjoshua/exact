import type { ContextToken } from './component/contracts.js';
import type { TaskContext } from './tasks/contracts.js';
import { validatedComponentContract } from './component-contract/contract-cache.js';

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
	concurrency?: 'parallel' | 'latest' | 'queue';
	dependencies: readonly Readonly<{
		index?: number;
		source: 'state' | 'props' | 'derived' | 'argument';
		path?: string;
	}>[];
	invocation?: Readonly<{
		arguments: readonly Readonly<{ index?: number; source: 'argument'; path?: string }>[];
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
	planVersion?: number;
	buildKey?: string;
	planEdgeId?: string;
	parentPlanId?: string;
	fallbackPlanId?: string;
	patchTargets?: readonly string[];
	discriminatorKind?: 'single' | 'branch' | 'keyed';
	discriminatorValues?: readonly string[];
	generation?: number;
}>;

/** Minimum browser-visible values required to resume one SSR component. */
export type ExactComponentResumptionContract = Readonly<{
	componentId: string;
	statePaths: readonly string[];
	valueCaptures: readonly string[];
	contexts: readonly string[];
	boundaries: readonly string[];
}>;

/** Compact target-local execution wiring emitted for one semantic component. */
export type ExactComponentExecutionContract = Readonly<{
	version: 1;
	ports: readonly Readonly<{
		index: number;
		kind: 'state' | 'props' | 'context' | 'derived' | 'argument';
		path: string;
		direction: 'input' | 'output' | 'inout';
	}>[];
	transitions: readonly Readonly<{
		id: string;
		taskId: string;
		activation: 'setup' | 'interaction';
		placement: 'client' | 'server' | 'isomorphic';
		readiness: 'blocking' | 'nonblocking';
		concurrency: 'parallel' | 'latest' | 'queue';
		inputs: readonly number[];
		outputs: readonly number[];
	}>[];
	reactive: readonly Readonly<{
		name: string;
		provenance: 'state' | 'props' | 'context' | 'derived' | 'cell' | 'snapshot' | 'unknown';
		allocation: 'constant' | 'live-slot' | 'inline' | 'computed' | 'snapshot' | 'structural';
		dependencies: readonly string[];
	}>[];
}>;

/** Canonical compiler description from which one durable state-machine instance is created. */
export type ExactCompiledComponentDefinitionContract = Readonly<{
	version: 1;
	instantiate: (...args: any[]) => any;
	state: readonly string[];
	tasks: readonly string[];
	reactive: ExactComponentExecutionContract['reactive'];
	render: 'returned-function';
	capabilities: readonly (
		| 'tasks'
		| 'continuations'
		| 'resumption'
		| 'inspection'
		| 'registry'
		| 'enhancements'
		| 'interactions'
		| 'compatibility'
	)[];
}>;

/** Target-local executable contract attached to a public component root. */
export type ExactComponentContract = Readonly<{
	/** Partition-aware component artifact contract. Version 1 artifacts are not adopted. */
	version: 2;
	placement: 'client' | 'server' | 'isomorphic' | 'unknown';
	role: 'client' | 'executor';
	implementations: readonly ExactComponentImplementationContract[];
	continuations: readonly ExactComponentContinuationContract[];
	executors: readonly ExactComponentContinuationExecutorContract[];
	boundaries: readonly ExactComponentBoundaryContract[];
	resumption?: ExactComponentResumptionContract;
	execution?: ExactComponentExecutionContract;
	definition?: ExactCompiledComponentDefinitionContract;
}>;

/** Composed target-local contracts indexed for runtime use. */
export type ExactComposedComponentContracts = Readonly<{
	implementations: Record<string, (...args: any[]) => any>;
	implementationsById: Record<string, (...args: any[]) => any>;
	continuations: Record<string, ExactComponentContinuationContract>;
	executors: Record<string, ExactComponentContinuationExecutorContract>;
	boundaries: Record<string, ExactComponentBoundaryContract>;
	resumptions: Record<string, ExactComponentResumptionContract>;
	executions: Record<string, ExactComponentExecutionContract>;
	definitions: Record<string, ExactCompiledComponentDefinitionContract>;
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
	return validatedComponentContract(component, contract, componentId);
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
	const executions: Record<string, ExactComponentExecutionContract> = {};
	const definitions: Record<string, ExactCompiledComponentDefinitionContract> = {};

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
		if (contract.execution)
			addUniqueJson(executions, componentId, contract.execution, 'execution plan');
		if (contract.definition) definitions[componentId] = contract.definition;
	}

	return Object.freeze({
		implementations,
		implementationsById,
		continuations,
		executors,
		boundaries,
		resumptions,
		executions,
		definitions
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
