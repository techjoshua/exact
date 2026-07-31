import type {
	NativeCompilerContextEffect,
	NativeCompilerEnvironmentEffectSource,
	NativeCompilerStateEffect
} from './process-contracts.js';

/** Describes one component task registration and its normalized facets. */
export type NativeCompilerTask = Readonly<{
	id: string;
	component: string;
	facets: readonly string[];
	requestedPlacement?: 'client' | 'server';
	priority: 'immediate' | 'normal' | 'deferred';
	readiness: 'blocking' | 'nonblocking';
	concurrency?: 'parallel' | 'latest' | 'queue';
	detached?: boolean;
	functionDefined?: boolean;
	invoked?: boolean;
	workStart?: number;
	workLength?: number;
	argumentCount?: number;
	activationArgumentCount?: number;
	capturedParameters: readonly number[];
	keyStart?: number;
	keyLength?: number;
	placement: 'client' | 'server' | 'isomorphic' | 'unknown';
	async: boolean;
	browserEffects: boolean;
	serverEffects: boolean;
	environmentEffect: 'neutral' | 'browser' | 'server' | 'mixed' | 'unknown';
	reactiveDependencies: readonly string[];
	dependencies: readonly Readonly<{
		index: number;
		source: 'state' | 'props' | 'context' | 'derived';
		path?: string;
		contextToken?: string;
	}>[];
	capturedInputs: readonly Readonly<{
		parameter: number;
		source: 'state' | 'props' | 'context' | 'derived';
		path: string;
		contextToken?: string;
	}>[];
	reads: readonly NativeCompilerStateEffect[];
	writes: readonly NativeCompilerStateEffect[];
	contexts: readonly NativeCompilerContextEffect[];
	effectSources: readonly NativeCompilerEnvironmentEffectSource[];
	resources: readonly NativeCompilerTaskResource[];
	signalCalls: readonly NativeCompilerTaskSignalCall[];
	diagnostics: readonly string[];
	start: number;
	length: number;
}>;

/** Describes a resource owned by one native task generation. */
export type NativeCompilerTaskResource = Readonly<{
	kind:
		| 'timeout'
		| 'interval'
		| 'animation-frame'
		| 'idle-callback'
		| 'fetch'
		| 'observer'
		| 'owned';
	disposal?: string;
	description?: string;
	start: number;
	length: number;
}>;

/** Describes a call that receives cancellation from its owning task. */
export type NativeCompilerTaskSignalCall = Readonly<{
	parameter: number;
	mode: 'direct' | 'options';
	eventOptions?: boolean;
	start: number;
	length: number;
}>;
