import type {
	ExactContextEffect,
	ExactEnvironmentEffect,
	ExactEnvironmentEffectSourceIR,
	ExactPlacement,
	ExactStateEffect
} from '../types.js';
import type { ExpressionTaskDependency } from './task-dependencies.js';

/** Defines the expression task site interface contract. */
export interface ExpressionTaskSite {
	readonly nodeId: string;
	/** Stable opaque continuation selector paired across client and executor artifacts. */
	readonly continuationId?: string;
	readonly component?: string;
	readonly componentId?: string;
	readonly start: number;
	readonly end: number;
	readonly requestedPlacement?: 'client' | 'server';
	readonly placement: ExactPlacement;
	readonly async: boolean;
	readonly browserEffects: boolean;
	readonly serverEffects: boolean;
	/** Exact state paths inferred as rerun dependencies for dependency-free tasks. */
	readonly dependencyPaths: readonly (readonly string[])[];
	/** Authored expressions captured for dependency-free tasks and substituted into their work. */
	readonly dependencies: readonly ExpressionTaskDependency[];
	readonly reads: readonly ExactStateEffect[];
	readonly writes: readonly ExactStateEffect[];
	readonly contexts: readonly ExactContextEffect[];
	readonly contextSites: readonly Readonly<{ start: number; effect: ExactContextEffect }>[];
	readonly diagnostics: readonly string[];
	readonly environmentEffect: ExactEnvironmentEffect;
	readonly effectSources: readonly ExactEnvironmentEffectSourceIR[];
}

/** Describes the planned expression task operation. */
export interface ExpressionTaskPlan {
	readonly sites: ReadonlyMap<string, ExpressionTaskSite>;
	readonly resources: ReadonlyMap<string, ExpressionTaskResource>;
	readonly lifecycleListeners: ReadonlyMap<string, ExpressionLifecycleListener>;
	readonly setupTasks: ReadonlyMap<string, ExpressionSetupTask>;
	readonly signalCalls: ReadonlyMap<string, ExpressionTaskSignalCall>;
	readonly diagnostics: readonly string[];
	readonly diagnosticLocations: readonly Readonly<{ message: string; start: number }>[];
}

/** Defines the expression lifecycle listener interface contract. */
export interface ExpressionLifecycleListener {
	readonly nodeId: string;
	readonly component: string;
	readonly start: number;
	readonly end: number;
}

/** A direct component-setup expression whose lifetime is compiler-owned. */
export interface ExpressionSetupTask {
	readonly nodeId: string;
	readonly component: string;
	readonly start: number;
	readonly end: number;
}

/** Defines the expression task resource kind type contract. */
export type ExpressionTaskResourceKind =
	| 'timeout'
	| 'interval'
	| 'animation-frame'
	| 'idle-callback'
	| 'fetch'
	| 'observer'
	| 'owned';
/** Defines the expression task resource disposal type contract. */
export type ExpressionTaskResourceDisposal = string;
/** Defines the expression task resource interface contract. */
export interface ExpressionTaskResource {
	readonly nodeId: string;
	readonly start: number;
	readonly end: number;
	readonly kind: ExpressionTaskResourceKind;
	readonly disposal?: ExpressionTaskResourceDisposal;
	readonly description?: string;
}

/** Defines the expression task signal call interface contract. */
export interface ExpressionTaskSignalCall {
	readonly nodeId: string;
	readonly start: number;
	readonly end: number;
	readonly parameter: number;
	readonly mode: 'direct' | 'options';
	readonly eventOptions?: boolean;
}
