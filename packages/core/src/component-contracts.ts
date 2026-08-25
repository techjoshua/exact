import type { ContextToken } from './component/contracts.js';
import type {
	ExactCompiledComponentCapability,
	ExactCompiledComponentUpdateContract
} from './component-definition-contracts.js';
import type { TaskContext } from './tasks/contracts.js';
import { validatedComponentContract } from './component-contract/contract-cache.js';
import { compiledComponentRenderABI, generalComponentABI } from './component/compiled-abi.js';

/** Global property under which compiled artifacts carry their target-local contract. */
export const exactComponentContract = Symbol.for('@exactjs/component-contract');

/** Global marker distinguishing a native eXact component from compatibility-owned functions. */
export const exactComponentType = Symbol.for('@exactjs/component');

/** Existential executable retained by compiler contracts without inspecting its parameters or result. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generated component implementations have heterogeneous callable signatures that are preserved by identity.
export type AnyExactComponentCallable = (...args: any[]) => any;

/** One executable implementation owned by a compiled component artifact. */
export type ExactComponentImplementationContract = Readonly<{
	id: string;
	name: string;
	role: 'root' | 'client-island' | 'server-part';
	implementation: AnyExactComponentCallable;
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
	/** State path and root-prop path pairs that client setup can reconstruct. */
	stateInputs: readonly (readonly [statePath: string, propPath: string])[];
	valueCaptures: readonly string[];
	contexts: readonly string[];
	boundaries: readonly string[];
}>;

/** Compact target-local execution wiring emitted for one semantic component. */
export type ExactComponentExecutionContract = Readonly<{
	version: 1;
	/** Port tuple: kind, authored path, direction. Its array position is its index. */
	ports: readonly (readonly [
		kind: 'state' | 'props' | 'context' | 'derived' | 'argument',
		path: string,
		direction: 'input' | 'output' | 'inout'
	])[];
	/** Transition tuple: identity, task, activation, placement, readiness, concurrency, inputs, outputs. */
	transitions: readonly (readonly [
		id: string,
		taskId: string,
		activation: 'setup' | 'interaction',
		placement: 'client' | 'server' | 'isomorphic',
		readiness: 'blocking' | 'nonblocking',
		concurrency: 'parallel' | 'latest' | 'queue',
		inputs: readonly number[],
		outputs: readonly number[]
	])[];
	/** Build-inspection inventory omitted from render-mode-projected runtime bundles. */
	reactive?: readonly Readonly<{
		name: string;
		provenance: 'state' | 'props' | 'context' | 'derived' | 'cell' | 'snapshot' | 'unknown';
		allocation: 'constant' | 'live-slot' | 'inline' | 'computed' | 'snapshot' | 'structural';
		dependencies: readonly string[];
	}>[];
}>;

/** Compiler-projected server execution slice consumed without rebuilding the component DAG. */
export type ExactServerComponentExecutionContract = Readonly<{
	version: 1;
	/** Selects the smallest server lane capable of executing the projected component. */
	classification: 'synchronous' | 'scheduled' | 'dynamic';
	/** Whether this artifact can bypass durable generic server ownership. State-only resumption and compiler-closed scheduled setup are supported. */
	lane: 'direct' | 'generic';
	deferredTaskProps?: readonly string[];
	/** Direct synchronous setup/render entry emitted only when generic ownership is unnecessary. */
	render?: AnyExactComponentCallable;
}>;

/** Canonical compiler description from which one durable state-machine instance is created. */
export type ExactCompiledComponentDefinitionContract = Readonly<{
	version: 1;
	instantiate: AnyExactComponentCallable;
	/** Compact compiler/runtime ABI bits used to omit impossible construction and disposal work. */
	abi: number;
	/** Component-wide dirty-state routing emitted only for compiler-proven direct DOM updates. */
	updates?: ExactCompiledComponentUpdateContract;
	/** Stable top-level state slots used by the compiled component-state facade. */
	state?: readonly string[];
	tasks?: readonly string[];
	reactive?: ExactComponentExecutionContract['reactive'];
	render?: 'returned-function';
	capabilities: readonly ExactCompiledComponentCapability[];
	/** Server-only execution classification and direct dependency slices. */
	server?: ExactServerComponentExecutionContract;
}>;

/** One component-owned direct DOM update program shared by every instance of its definition. */
export type {
	ExactCompiledComponentCapability,
	ExactCompiledComponentUpdateContract
} from './component-definition-contracts.js';

/** Target-local executable contract attached to a public component root. */
export type ExactComponentContract = Readonly<{
	/** Partition-aware component artifact contract. Version 1 artifacts are not adopted. */
	version: 2;
	placement: 'client' | 'server' | 'isomorphic' | 'unknown';
	role: 'client' | 'render' | 'executor';
	implementations: readonly ExactComponentImplementationContract[];
	continuations: readonly ExactComponentContinuationContract[];
	executors: readonly ExactComponentContinuationExecutorContract[];
	boundaries: readonly ExactComponentBoundaryContract[];
	resumption?: ExactComponentResumptionContract;
	execution?: ExactComponentExecutionContract;
	definition?: ExactCompiledComponentDefinitionContract;
}>;

/** Component contract whose executable definition is guaranteed by the compiler artifact ABI. */
export type ExactCompiledComponentContract = ExactComponentContract &
	Readonly<{ definition: ExactCompiledComponentDefinitionContract }>;

/** Composed target-local contracts indexed for runtime use. */
export type ExactComposedComponentContracts = Readonly<{
	implementations: Record<string, AnyExactComponentCallable>;
	implementationsById: Record<string, AnyExactComponentCallable>;
	continuations: Record<string, ExactComponentContinuationContract>;
	executors: Record<string, ExactComponentContinuationExecutorContract>;
	boundaries: Record<string, ExactComponentBoundaryContract>;
	resumptions: Record<string, ExactComponentResumptionContract>;
	executions: Record<string, ExactComponentExecutionContract>;
	definitions: Record<string, ExactCompiledComponentDefinitionContract>;
}>;

type ContractComponent = AnyExactComponentCallable & {
	[exactComponentContract]?: ExactComponentContract;
	[exactComponentType]?: string;
};

const compatibilityCapabilities = ['compatibility', 'collections', 'dynamic-components'] as const;

/**
 * Constructs the explicit target-local artifact used only at a foreign component boundary.
 * Native eXact authoring must use compiler-produced artifacts instead.
 */
export function createExactCompatibilityArtifact<T extends AnyExactComponentCallable>(
	component: T,
	identity: string,
	target: 'client' | 'server'
): T {
	return attachRuntimeBoundaryArtifact(component, identity, target, compatibilityCapabilities);
}

/** Constructs the narrow artifact for a framework-owned boundary over an opaque runtime VNode. */
export function createExactDynamicBoundaryArtifact<T extends AnyExactComponentCallable>(
	component: T,
	identity: string,
	target: 'client' | 'server'
): T {
	return attachRuntimeBoundaryArtifact(component, identity, target, [
		'dynamic-components',
		'interactions'
	]);
}

/** Constructs a complete runtime artifact solely for low-level framework test fixtures. */
export function createExactFrameworkFixtureArtifact<T extends AnyExactComponentCallable>(
	component: T,
	identity: string
): T {
	const existing = (component as ContractComponent)[exactComponentContract];
	if (existing?.definition) return component;
	if (existing && !existing.definition) {
		const fixture = runtimeBoundaryDefinition(component, ['interactions', 'tasks'], 'client');
		Object.defineProperties(component, {
			[exactComponentType]: {
				configurable: false,
				enumerable: false,
				value: (component as ContractComponent)[exactComponentType] ?? identity
			},
			[exactComponentContract]: {
				configurable: false,
				enumerable: false,
				value: { ...existing, definition: fixture }
			}
		});
		return component;
	}
	return attachRuntimeBoundaryArtifact(component, identity, 'client', ['interactions', 'tasks']);
}

/** Constructs an artifact for a framework-owned logical owner with no component topology. */
export function createExactInternalOwnerArtifact<T extends AnyExactComponentCallable>(
	component: T,
	identity: string,
	target: 'client' | 'server'
): T {
	return attachRuntimeBoundaryArtifact(component, identity, target, []);
}

function attachRuntimeBoundaryArtifact<T extends AnyExactComponentCallable>(
	component: T,
	identity: string,
	target: 'client' | 'server',
	capabilities: ExactCompiledComponentDefinitionContract['capabilities']
): T {
	if (!identity) throw new Error('eXact runtime artifact identity must be a non-empty string');
	if (target !== 'client' && target !== 'server')
		throw new TypeError('eXact runtime artifacts require a target-local artifact target');
	const implementationId = `${identity}:implementation`;
	const definition = runtimeBoundaryDefinition(component, capabilities, target);
	const contract: ExactComponentContract = {
		version: 2,
		placement: target,
		role: target === 'client' ? 'client' : 'executor',
		implementations: [
			{
				id: implementationId,
				name: component.name || 'AnonymousBoundary',
				role: 'root',
				implementation: component
			}
		],
		continuations: [],
		executors: [],
		boundaries: [],
		execution: { version: 1, ports: [], transitions: [], reactive: [] },
		definition
	};
	Object.defineProperties(component, {
		[exactComponentType]: { configurable: false, enumerable: false, value: identity },
		[exactComponentContract]: { configurable: false, enumerable: false, value: contract }
	});
	return component;
}

function runtimeBoundaryDefinition(
	component: AnyExactComponentCallable,
	capabilities: ExactCompiledComponentDefinitionContract['capabilities'],
	target: 'client' | 'server'
): ExactCompiledComponentDefinitionContract {
	return {
		version: 1,
		abi:
			target === 'server' ? generalComponentABI | compiledComponentRenderABI : generalComponentABI,
		instantiate: component,
		state: [],
		tasks: [],
		reactive: [],
		render: 'returned-function',
		capabilities
	};
}

/** Returns whether a callable carries a valid native eXact component identity. */
export function isExactComponent(component: unknown): component is AnyExactComponentCallable {
	if (typeof component !== 'function') return false;
	const identity = (component as ContractComponent)[exactComponentType];
	return typeof identity === 'string' && identity.length > 0;
}

/** Reads and validates compiler-attached metadata from one target-local component export. */
export function readExactComponentContract(
	component: AnyExactComponentCallable
): ExactComponentContract | undefined {
	const contract = (component as ContractComponent)[exactComponentContract];
	if (!contract) return undefined;
	const componentId = exactComponentIdentity(component);
	return validatedComponentContract(component, contract, componentId);
}

/** Reads one executable compiler artifact and rejects identity-only native values. */
export function readExactCompiledComponentContract(
	component: AnyExactComponentCallable
): ExactCompiledComponentContract {
	const contract = readExactComponentContract(component);
	if (!contract?.definition)
		throw new TypeError('Native eXact component execution requires a compiled component artifact');
	return contract as ExactCompiledComponentContract;
}

/** Reads build-validated compiler metadata without repeating recursive runtime validation. */
export const readPreparedExactComponentContract = (
	component: AnyExactComponentCallable
): ExactComponentContract | undefined => (component as ContractComponent)[exactComponentContract];

/** Reads a build-validated executable compiler artifact. */
export function readPreparedExactCompiledComponentContract(
	component: AnyExactComponentCallable
): ExactCompiledComponentContract {
	const contract = readPreparedExactComponentContract(component);
	if (!contract?.definition)
		throw new TypeError('Native eXact component execution requires a compiled component artifact');
	return contract as ExactCompiledComponentContract;
}

/** Returns the stable compiler identity used to pair SSR and client component boundaries. */
export function exactComponentIdentity(component: AnyExactComponentCallable): string {
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
	components: readonly AnyExactComponentCallable[],
	role: ExactComponentContract['role']
): ExactComposedComponentContracts {
	return composeComponentContracts(components, role, readExactComponentContract);
}

/** Composes build-validated compiler metadata without repeating recursive validation. */
export function composePreparedExactComponentContracts(
	components: readonly AnyExactComponentCallable[],
	role: ExactComponentContract['role']
): ExactComposedComponentContracts {
	return composeComponentContracts(components, role, readPreparedExactComponentContract);
}

function composeComponentContracts(
	components: readonly AnyExactComponentCallable[],
	role: ExactComponentContract['role'],
	readContract: (component: AnyExactComponentCallable) => ExactComponentContract | undefined
): ExactComposedComponentContracts {
	const implementations: Record<string, AnyExactComponentCallable> = {};
	const implementationsById: Record<string, AnyExactComponentCallable> = {};
	const continuations: Record<string, ExactComponentContinuationContract> = {};
	const executors: Record<string, ExactComponentContinuationExecutorContract> = {};
	const boundaries: Record<string, ExactComponentBoundaryContract> = {};
	const resumptions: Record<string, ExactComponentResumptionContract> = {};
	const executions: Record<string, ExactComponentExecutionContract> = {};
	const definitions: Record<string, ExactCompiledComponentDefinitionContract> = {};

	for (const component of components) {
		const contract = readContract(component);
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
	target: Record<string, AnyExactComponentCallable>,
	key: string,
	implementation: AnyExactComponentCallable
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
