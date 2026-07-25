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
	stateReads: readonly ExactContinuationStatePathContract[];
	stateWrites: readonly ExactContinuationStatePathContract[];
	publicContexts: readonly string[];
	serverContexts: readonly string[];
	boundaries: readonly string[];
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
	boundaries: readonly ExactComponentBoundaryContract[];
	resumption?: ExactComponentResumptionContract;
}>;

/** Composed target-local contracts indexed for runtime use. */
export type ExactComposedComponentContracts = Readonly<{
	implementations: Record<string, (...args: any[]) => any>;
	implementationsById: Record<string, (...args: any[]) => any>;
	continuations: Record<string, ExactComponentContinuationContract>;
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
	if (
		contract.version !== 1 ||
		typeof contract.id !== 'string' ||
		!Array.isArray(contract.implementations) ||
		!Array.isArray(contract.continuations) ||
		!Array.isArray(contract.boundaries)
	) {
		throw new Error('Unsupported eXact component contract');
	}
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
		boundaries,
		resumptions
	});
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
