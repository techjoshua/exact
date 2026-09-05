import {
	compiledComponentCollectionsABI,
	compiledComponentContextsABI,
	compiledComponentRenderABI,
	generalComponentABI
} from '../component/compiled-abi.js';
import {
	exactComponentContract,
	exactComponentType,
	type AnyExactComponentCallable,
	type ExactComponentExecutableArtifact,
	type ExactComponentContract
} from '../component-contracts.js';
import {
	attachExactCompiledClientComponent,
	disposeExactClientComponent,
	receiveExactClientComponentProps
} from '../component-abi/compiled-runtime.js';
import {
	disposeExactServerComponent,
	issueExactServerComponent,
	writeExactServerComponent
} from '../component-abi/server-runtime.js';
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
	identity: string,
	target: 'client' | 'server' = 'client'
): T {
	const existing = (component as ContractComponent)[exactComponentContract];
	if (existing?.artifact) {
		if (existing.artifact.target !== target)
			throw new TypeError('A framework fixture cannot change its target-local artifact target');
		return component;
	}
	if (existing && !existing.artifact) {
		if (existing.version !== 3)
			throw new TypeError('A framework fixture requires a current component contract');
		const hasContexts =
			(existing.resumption?.contexts.length ?? 0) !== 0 ||
			existing.continuations.some(
				(continuation) =>
					continuation.publicContexts.length !== 0 ||
					continuation.serverContexts.length !== 0 ||
					continuation.contextWrites.length !== 0 ||
					(continuation.serverContextWrites?.length ?? 0) !== 0
			);
		const capabilities: ExactComponentExecutableArtifact['capabilities'] = [
			'compatibility',
			'interactions',
			'tasks',
			...(existing.continuations.length !== 0 ? (['continuations'] as const) : []),
			...(existing.resumption ? (['resumption'] as const) : []),
			...(hasContexts ? (['contexts'] as const) : [])
		];
		let fixture = runtimeBoundaryDefinition(
			component,
			identity,
			target,
			capabilities,
			generalComponentABI | (hasContexts ? compiledComponentContextsABI : 0),
			true
		);
		fixture = {
			...fixture,
			state: existing.resumption?.statePaths ?? fixture.state,
			tasks: existing.continuations.map((continuation) => continuation.id),
			...(fixture.target === 'server' && existing.resumption && existing.continuations.length !== 0
				? {
						execution: {
							...fixture.execution,
							publication: {
								kind: 'resumption' as const,
								name: component.name || identity
							}
						}
					}
				: {})
		};
		Object.defineProperties(component, {
			[exactComponentType]: {
				configurable: false,
				enumerable: false,
				value: (component as ContractComponent)[exactComponentType] ?? identity
			},
			[exactComponentContract]: {
				configurable: false,
				enumerable: false,
				value: { ...existing, artifact: fixture }
			}
		});
		return component;
	}
	return attachRuntimeBoundaryArtifact(
		component,
		identity,
		target,
		['compatibility', 'interactions', 'tasks'],
		generalComponentABI,
		true
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
	capabilities: ExactComponentExecutableArtifact['capabilities'],
	abi: number,
	directServer = false
): T {
	if (!identity) throw new Error('eXact runtime artifact identity must be a non-empty string');
	if (target !== 'client' && target !== 'server')
		throw new TypeError('eXact runtime artifacts require a target-local artifact target');
	const implementationId = `${identity}:implementation`;
	const artifact = runtimeBoundaryDefinition(
		component,
		identity,
		target,
		capabilities,
		abi,
		directServer
	);
	const contract: ExactComponentContract = {
		version: 3,
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
		artifact
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
	identity: string,
	target: 'client' | 'server',
	capabilities: ExactComponentExecutableArtifact['capabilities'],
	abi: number,
	directServer = false
): ExactComponentExecutableArtifact {
	const construct: CompiledComponentInstanceConstructor =
		abi & generalComponentABI
			? constructDurableComponentInstance
			: constructRenderComponentInstance;
	const common = {
		version: 1 as const,
		id: identity,
		abi,
		instantiate: component,
		construct,
		state: [],
		props: [],
		tasks: [],
		reactive: [],
		render: 'returned-function' as const,
		capabilities
	};
	return target === 'client'
		? {
				...common,
				target,
				attach: attachExactCompiledClientComponent,
				receive: receiveExactClientComponentProps,
				dispose: disposeExactClientComponent
			}
		: {
				...common,
				target,
				issue: issueExactServerComponent,
				write: writeExactServerComponent,
				dispose: disposeExactServerComponent,
				execution: directServer
					? {
							version: 1,
							classification: 'synchronous',
							lane: 'direct',
							render: component
						}
					: { version: 1, classification: 'dynamic', lane: 'generic' }
			};
}
