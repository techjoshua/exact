import {
	pageComponentDomain,
	type AnyComponentInstance,
	type ComponentContextValues
} from '@exactjs/core';
import { readPreparedExactExecutableComponentContract } from '@exactjs/core/framework/component-contracts';
import { executeExactCompatibilityComponentOutput } from '@exactjs/core/runtime/compatibility-component-abi';
import type { AnyReactComponentType, ReactNode } from '../types.js';
import { ReactRootContext, type ReactRootRuntime } from './shared.js';
import {
	finishReactRendererTransition,
	readReactRendererTransition,
	type ReactTransitionOwnership
} from './shared.js';
import {
	reactSuspenseIslandState,
	ReactClientIsland,
	ReactServerIsland
} from './island-artifacts.js';

/** Opaque durable owner used only by the React renderer's reconciliation tree. */
export type ReactRendererComponentInstance = AnyComponentInstance;

/** Creates the ambient root contexts shared by every React-owned descendant. */
export function createReactRendererRootContexts(runtime: ReactRootRuntime): ComponentContextValues {
	return new Map([[ReactRootContext.id, runtime]]);
}

/** Constructs one React-owned component instance without creating a native component operation. */
export function constructReactRendererComponent(
	type: AnyReactComponentType | symbol,
	props: Record<string, unknown>,
	parent: ReactRendererComponentInstance | undefined,
	rootContexts: ComponentContextValues
): ReactRendererComponentInstance {
	const contract = readPreparedExactExecutableComponentContract(ReactClientIsland);
	const artifact = contract.artifact;
	if (artifact.target !== 'client')
		throw new TypeError('React client renderer selected a server artifact');
	return artifact.construct(
		parent,
		{ ...props, component: type },
		parent?.ambientContexts ?? rootContexts,
		parent?.domain ?? pageComponentDomain,
		undefined,
		contract
	);
}

/** Constructs one request-owned React component instance for the separate React SSR renderer. */
export function constructReactServerRendererComponent(
	type: AnyReactComponentType | symbol,
	props: Record<string, unknown>,
	parent: ReactRendererComponentInstance | undefined,
	rootContexts: ComponentContextValues
): ReactRendererComponentInstance {
	const contract = readPreparedExactExecutableComponentContract(ReactServerIsland);
	const artifact = contract.artifact;
	if (artifact.target !== 'server') throw new TypeError('React SSR selected a client artifact');
	return artifact.construct(
		parent,
		{ ...props, component: type },
		parent?.ambientContexts ?? rootContexts,
		parent?.domain ?? pageComponentDomain,
		undefined,
		contract
	);
}

/** Executes one React-owned component and installs its focused invalidation callback. */
export function renderReactRendererComponent(
	instance: ReactRendererComponentInstance,
	onInvalidate: () => void
): ReactNode {
	return executeExactCompatibilityComponentOutput(instance, onInvalidate) as ReactNode;
}

/** Reads transition ownership associated with the component output awaiting reconciliation. */
export function readReactRendererComponentTransition(
	instance: ReactRendererComponentInstance
): ReactTransitionOwnership | undefined {
	return readReactRendererTransition(instance);
}

/** Commits and releases transition ownership after the renderer has reconciled the output. */
export function finishReactRendererComponentTransition(
	instance: ReactRendererComponentInstance
): void {
	finishReactRendererTransition(instance);
}

/** Delivers the next React props through the precompiled island's open prop receiver. */
export function receiveReactRendererComponent(
	instance: ReactRendererComponentInstance,
	type: AnyReactComponentType | symbol,
	props: Record<string, unknown>
): void {
	const contract = readPreparedExactExecutableComponentContract(ReactClientIsland);
	if (contract.artifact.target !== 'client')
		throw new TypeError('React client renderer selected a server artifact');
	contract.artifact.receive(instance, { ...props, component: type }, []);
}

/** Publishes React mount lifecycles after the renderer has placed the owned DOM range. */
export function mountReactRendererComponent(instance: ReactRendererComponentInstance): void {
	instance.markMounted();
}

/** Releases every hook, class lifecycle, task, and reactive resource owned by the React component. */
export function disposeReactRendererComponent(instance: ReactRendererComponentInstance): void {
	instance.unmount('react-renderer-dispose');
}

/** Reads pending React Suspense work owned by one React renderer component. */
export function readReactRendererSuspension(
	instance: ReactRendererComponentInstance
): Readonly<{ suspended: boolean; promise?: PromiseLike<unknown> }> | undefined {
	return reactSuspenseIslandState(instance);
}
