import type { ContextToken } from './component/contracts.js';
import type { TaskContext } from './tasks/contracts.js';
import { validatedComponentContract } from './component-contract/contract-cache.js';
import {
	addUniqueExecutor,
	addUniqueImplementation,
	addUniqueJson
} from './component-contract/composition-support.js';
import type { ExactComponentExecutableArtifact } from './component-abi/artifact.js';
import type { ExactClientComponentArtifact } from './component-abi/client.js';
import type { ExactServerComponentArtifact } from './component-abi/server.js';
import type {
	AnyExactComponentCallable,
	ExactComponentReactiveAllocation
} from './component-abi/executable-fields.js';

export type { ExactComponentExecutableArtifact } from './component-abi/artifact.js';
export type { ExactClientComponentArtifact } from './component-abi/client.js';
export type {
	ExactServerComponentArtifact,
	ExactServerComponentExecution
} from './component-abi/server.js';
export type { AnyExactComponentCallable } from './component-abi/executable-fields.js';
export {
	decodeExactValueWithSchema,
	type ExactValueSerializationSchema
} from './component-abi/value-serialization.js';

/** Global property under which compiled artifacts carry their target-local contract. */
export const exactComponentContract = Symbol.for('@exactjs/component-contract');

/** Global marker distinguishing a native eXact component from compatibility-owned functions. */
export const exactComponentType = Symbol.for('@exactjs/component');

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
	/** Server-only primitive setup values that sparse capture may omit. */
	stateDefaults?: readonly (readonly [
		statePath: string,
		value: string | number | boolean | null
	])[];
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
	reactive?: readonly ExactComponentReactiveAllocation[];
}>;

/** One component-owned direct DOM update program shared by every instance of its definition. */
export type {
	ExactCompiledComponentCapability,
	ExactCompiledComponentInputUpdateContract,
	ExactCompiledComponentUpdateContract,
	ExactNarrowComponentUpdateContract,
	ExactWideComponentUpdateContract
} from './component-definition-contracts.js';

/** Target-local executable contract attached to a public component root. */
export type ExactComponentContract = Readonly<{
	/** Target-discriminated component contract. Version-2 definition records are rejected. */
	version: 3;
	placement: 'client' | 'server' | 'isomorphic' | 'unknown';
	role: 'client' | 'render' | 'executor';
	implementations: readonly ExactComponentImplementationContract[];
	continuations: readonly ExactComponentContinuationContract[];
	executors: readonly ExactComponentContinuationExecutorContract[];
	boundaries: readonly ExactComponentBoundaryContract[];
	resumption?: ExactComponentResumptionContract;
	execution?: ExactComponentExecutionContract;
	artifact: ExactComponentExecutableArtifact;
}>;

/** Build-projected runtime attachment after adapter-owned composition facts are erased. */
export type ExactPreparedComponentContract = Readonly<
	Pick<ExactComponentContract, 'artifact'> & Partial<Omit<ExactComponentContract, 'artifact'>>
>;

/** Runtime attachment whose single executable artifact is guaranteed by the current target ABI. */
export type ExactExecutableComponentContract = ExactPreparedComponentContract;

/** Prepared attachment whose target-local artifact is always executable. */
export type ExactPreparedExecutableComponentContract = ExactExecutableComponentContract;

/** Current executable contract proven to carry the client target ABI. */
export type ExactClientExecutableComponentContract = ExactExecutableComponentContract &
	Readonly<{ artifact: ExactClientComponentArtifact }>;

/** Current executable contract proven to carry the server target ABI. */
export type ExactServerExecutableComponentContract = ExactComponentContract &
	Readonly<{ artifact: ExactServerComponentArtifact }>;

/** Composed target-local contracts indexed for runtime use. */
export type ExactComposedComponentContracts = Readonly<{
	implementations: Record<string, AnyExactComponentCallable>;
	implementationsById: Record<string, AnyExactComponentCallable>;
	continuations: Record<string, ExactComponentContinuationContract>;
	executors: Record<string, ExactComponentContinuationExecutorContract>;
	boundaries: Record<string, ExactComponentBoundaryContract>;
	resumptions: Record<string, ExactComponentResumptionContract>;
	executions: Record<string, ExactComponentExecutionContract>;
	artifacts: Record<string, ExactComponentExecutableArtifact>;
}>;

type ContractComponent = AnyExactComponentCallable & {
	[exactComponentContract]?: ExactComponentContract;
	[exactComponentType]?: string;
};

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

/** Reads one current executable target artifact and rejects obsolete or identity-only values. */
export function readExactExecutableComponentContract(
	component: AnyExactComponentCallable
): ExactExecutableComponentContract {
	const contract = readExactComponentContract(component);
	if (!contract?.artifact)
		throw new TypeError('Native eXact component execution requires a compiled component artifact');
	return contract;
}

/** Reads and validates one client-target executable component contract. */
export function readExactClientExecutableComponentContract(
	component: AnyExactComponentCallable
): ExactClientExecutableComponentContract {
	const contract = readExactExecutableComponentContract(component);
	if (contract.artifact.target !== 'client')
		throw new TypeError('Client execution requires a current client component artifact');
	return contract as ExactClientExecutableComponentContract;
}

/** Reads and validates one server-target executable component contract. */
export function readExactServerExecutableComponentContract(
	component: AnyExactComponentCallable
): ExactServerExecutableComponentContract {
	const contract = readExactExecutableComponentContract(component);
	if (contract.artifact.target !== 'server')
		throw new TypeError('Server execution requires a current server component artifact');
	return contract as ExactServerExecutableComponentContract;
}

/** Reads build-validated compiler metadata without repeating recursive runtime validation. */
export const readPreparedExactComponentContract = (
	component: AnyExactComponentCallable
): ExactPreparedComponentContract | undefined =>
	(component as ContractComponent)[exactComponentContract];

/** Reads a build-validated current executable target artifact. */
export function readPreparedExactExecutableComponentContract(
	component: AnyExactComponentCallable
): ExactPreparedExecutableComponentContract {
	const contract = readPreparedExactComponentContract(component);
	if (!contract?.artifact)
		throw new TypeError(
			`Native eXact component execution requires a compiled component artifact: ${component.name || '<anonymous>'}`
		);
	return contract;
}

/** Reads one build-validated client-target executable component contract. */
export function readPreparedExactClientExecutableComponentContract(
	component: AnyExactComponentCallable
): ExactPreparedComponentContract & Readonly<{ artifact: ExactClientComponentArtifact }> {
	const contract = readPreparedExactExecutableComponentContract(component);
	if (contract.artifact.target !== 'client')
		throw new TypeError('Client execution requires a current client component artifact');
	return contract as ExactPreparedComponentContract &
		Readonly<{ artifact: ExactClientComponentArtifact }>;
}

/** Reads one build-validated server-target executable component contract. */
export function readPreparedExactServerExecutableComponentContract(
	component: AnyExactComponentCallable
): ExactServerExecutableComponentContract {
	const contract = readPreparedExactExecutableComponentContract(component);
	if (contract.artifact.target !== 'server')
		throw new TypeError('Server execution requires a current server component artifact');
	return contract as ExactServerExecutableComponentContract;
}

/** Returns the stable compiler identity used to pair SSR and client component boundaries. */
export function exactComponentIdentity(component: AnyExactComponentCallable): string {
	const identity = (component as ContractComponent)[exactComponentType];
	if (typeof identity === 'string' && identity) return identity;
	throw new Error('Native eXact components require compiler-owned identity');
}

/** Composes reachable imported component contracts into duplicate-checked runtime indexes. */
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
	readContract: (component: AnyExactComponentCallable) => ExactPreparedComponentContract | undefined
): ExactComposedComponentContracts {
	const implementations: Record<string, AnyExactComponentCallable> = {};
	const implementationsById: Record<string, AnyExactComponentCallable> = {};
	const continuations: Record<string, ExactComponentContinuationContract> = {};
	const executors: Record<string, ExactComponentContinuationExecutorContract> = {};
	const boundaries: Record<string, ExactComponentBoundaryContract> = {};
	const resumptions: Record<string, ExactComponentResumptionContract> = {};
	const executions: Record<string, ExactComponentExecutionContract> = {};
	const artifacts: Record<string, ExactComponentExecutableArtifact> = {};

	for (const component of components) {
		const contract = readContract(component);
		if (!contract) continue;
		const componentId = exactComponentIdentity(component);
		const projectedRole =
			contract.role ?? (contract.artifact.target === 'client' ? 'client' : 'render');
		if (projectedRole !== role)
			throw new Error(
				`Expected eXact ${role} component contract for ${componentId}, received ${projectedRole}`
			);
		const projectedImplementations = contract.implementations ?? [
			{
				id: componentId,
				name: component.name,
				role: 'root' as const,
				implementation: component
			}
		];
		for (const implementation of projectedImplementations) {
			addUniqueImplementation(
				implementationsById,
				implementation.id,
				implementation.implementation
			);
			addUniqueImplementation(implementations, implementation.name, implementation.implementation);
		}
		for (const continuation of contract.continuations ?? [])
			addUniqueJson(continuations, continuation.id, continuation, 'continuation');
		for (const executor of contract.executors ?? []) addUniqueExecutor(executors, executor);
		for (const boundary of contract.boundaries ?? [])
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
		artifacts[componentId] = contract.artifact;
	}

	return Object.freeze({
		implementations,
		implementationsById,
		continuations,
		executors,
		boundaries,
		resumptions,
		executions,
		artifacts
	});
}
