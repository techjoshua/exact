import type {
	ExactContextEffect,
	ExactEnvironmentEffect,
	ExactEnvironmentEffectSourceIR,
	ExactPlacement,
	ExactStateEffect
} from '../types.js';

export interface ExpressionTaskSite {
	readonly nodeId: string;
	readonly component?: string;
	readonly componentId?: string;
	readonly start: number;
	readonly end: number;
	readonly requestedPlacement?: 'client' | 'server';
	readonly placement: ExactPlacement;
	readonly async: boolean;
	readonly browserEffects: boolean;
	readonly serverEffects: boolean;
	readonly reads: readonly ExactStateEffect[];
	readonly writes: readonly ExactStateEffect[];
	readonly contexts: readonly ExactContextEffect[];
	readonly contextSites: readonly Readonly<{ start: number; effect: ExactContextEffect }>[];
	readonly diagnostics: readonly string[];
	readonly environmentEffect: ExactEnvironmentEffect;
	readonly effectSources: readonly ExactEnvironmentEffectSourceIR[];
}

export interface ExpressionTaskPlan {
	readonly sites: ReadonlyMap<string, ExpressionTaskSite>;
	readonly resources: ReadonlyMap<string, ExpressionTaskResource>;
	readonly lifecycleListeners: ReadonlyMap<string, ExpressionLifecycleListener>;
	readonly setupTasks: ReadonlyMap<string, ExpressionSetupTask>;
	readonly signalCalls: ReadonlyMap<string, ExpressionTaskSignalCall>;
	readonly diagnostics: readonly string[];
	readonly diagnosticLocations: readonly Readonly<{ message: string; start: number }>[];
}

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

export type ExpressionTaskResourceKind =
	| 'timeout'
	| 'interval'
	| 'animation-frame'
	| 'idle-callback'
	| 'fetch'
	| 'observer'
	| 'owned';
export type ExpressionTaskResourceDisposal = string;
export interface ExpressionTaskResource {
	readonly nodeId: string;
	readonly start: number;
	readonly end: number;
	readonly kind: ExpressionTaskResourceKind;
	readonly disposal?: ExpressionTaskResourceDisposal;
	readonly description?: string;
}

export interface ExpressionTaskSignalCall {
	readonly nodeId: string;
	readonly start: number;
	readonly end: number;
	readonly parameter: number;
	readonly mode: 'direct' | 'options';
	readonly eventOptions?: boolean;
}
