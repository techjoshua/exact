export {
	exactComponentForReactInstance,
	isUnmountedReactClassInstance,
	ReactCacheContext,
	reactCompatibilityTarget,
	ReactRootContext,
	recordReactResourceHint,
	reactOwnerComponentName,
	reactErrorOwnerName,
	type ReactCacheScope,
	type ReactRootRuntime
} from './internals.js';
export {
	constructReactRendererComponent,
	constructReactServerRendererComponent,
	createReactRendererRootContexts,
	disposeReactRendererComponent,
	finishReactRendererComponentTransition,
	mountReactRendererComponent,
	receiveReactRendererComponent,
	readReactRendererSuspension,
	readReactRendererComponentTransition,
	renderReactRendererComponent,
	type ReactRendererComponentInstance
} from './runtime/renderer-bridge.js';
export type { ReactTransitionOwnership } from './runtime/shared.js';
export {
	exactComponentType,
	isReactPortal,
	invokeReactType,
	reactElementCompatibilityContribution,
	toReactNode
} from './runtime/nodes.js';
export { assignReactRef } from './runtime/refs.js';
export { reactEventHandler } from './runtime/host-props.js';
export {
	REACT_ACTIVITY_TYPE,
	REACT_FRAGMENT_TYPE,
	isReactElement,
	REACT_PROFILER_TYPE,
	REACT_STRICT_MODE_TYPE,
	REACT_SUSPENSE_TYPE
} from './runtime/shared.js';
import { ReactClientIsland } from './runtime/island-artifacts.js';
import type { ComponentFunction } from '@exactjs/core';
import type { AnyReactComponentType } from './types.js';

type ReactIslandProps = Record<string, unknown> & { component: AnyReactComponentType };

/** Precompiled client React-island artifact selected by the default development entry point. */
export const adaptReactComponent: ComponentFunction<
	Record<string, unknown>,
	ReactIslandProps
> = ReactClientIsland;

/** Named form of the precompiled React-island artifact for explicit native composition. */
export const ReactHost: ComponentFunction<
	Record<string, unknown>,
	ReactIslandProps
> = ReactClientIsland;
