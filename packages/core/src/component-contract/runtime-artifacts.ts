import {
	compiledComponentCollectionsABI,
	compiledComponentRenderABI,
	generalComponentABI
} from '../component/compiled-abi.js';
import {
	exactComponentContract,
	exactComponentType,
	type AnyExactComponentCallable,
	type ExactCompiledComponentDefinitionContract,
	type ExactComponentContract
} from '../component-contracts.js';
import { constructDurableComponentInstance } from '../component/durable-instance-construction.js';
import type { CompiledComponentInstanceConstructor } from '../component/instance-construction.js';
import { constructRenderComponentInstance } from '../component/render-instance-construction.js';

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
	return attachRuntimeBoundaryArtifact(
		component,
		identity,
		target,
		compatibilityCapabilities,
		generalComponentABI |
			compiledComponentCollectionsABI |
			(target === 'server' ? compiledComponentRenderABI : 0)
	);
}

/** Constructs a precompiled framework boundary whose renderer invokes its render operation. */
export function createExactCompiledDynamicBoundaryArtifact<T extends AnyExactComponentCallable>(
	component: T,
	identity: string,
	target: 'client' | 'server'
): T {
	return attachRuntimeBoundaryArtifact(
		component,
		identity,
		target,
		['dynamic-components', 'interactions'],
		compiledComponentRenderABI
	);
}

/** Constructs a complete runtime artifact solely for low-level framework test fixtures. */
export function createExactFrameworkFixtureArtifact<T extends AnyExactComponentCallable>(
	component: T,
	identity: string
): T {
	const existing = (component as ContractComponent)[exactComponentContract];
	if (existing?.definition) return component;
	if (existing && !existing.definition) {
		const fixture = runtimeBoundaryDefinition(
			component,
			['interactions', 'tasks'],
			generalComponentABI
		);
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
	return attachRuntimeBoundaryArtifact(
		component,
		identity,
		'client',
		['interactions', 'tasks'],
		generalComponentABI
	);
}

/** Constructs an artifact for a framework-owned logical owner with no component topology. */
export function createExactInternalOwnerArtifact<T extends AnyExactComponentCallable>(
	component: T,
	identity: string,
	target: 'client' | 'server'
): T {
	return attachRuntimeBoundaryArtifact(
		component,
		identity,
		target,
		[],
		target === 'server' ? compiledComponentRenderABI : 0
	);
}

/** Attaches a complete non-compiler artifact at one explicit framework boundary. */
function attachRuntimeBoundaryArtifact<T extends AnyExactComponentCallable>(
	component: T,
	identity: string,
	target: 'client' | 'server',
	capabilities: ExactCompiledComponentDefinitionContract['capabilities'],
	abi: number
): T {
	if (!identity) throw new Error('eXact runtime artifact identity must be a non-empty string');
	if (target !== 'client' && target !== 'server')
		throw new TypeError('eXact runtime artifacts require a target-local artifact target');
	const implementationId = `${identity}:implementation`;
	const definition = runtimeBoundaryDefinition(component, capabilities, abi);
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

/** Describes the executable record shared by explicit runtime-owned boundaries. */
function runtimeBoundaryDefinition(
	component: AnyExactComponentCallable,
	capabilities: ExactCompiledComponentDefinitionContract['capabilities'],
	abi: number
): ExactCompiledComponentDefinitionContract {
	const construct: CompiledComponentInstanceConstructor =
		abi & generalComponentABI
			? constructDurableComponentInstance
			: constructRenderComponentInstance;
	return {
		version: 1,
		abi,
		instantiate: component,
		construct,
		state: [],
		tasks: [],
		reactive: [],
		render: 'returned-function',
		capabilities
	};
}
