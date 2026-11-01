import type { NativeCompilerStateEffect } from './process-state-contracts.js';

/** Describes one context-token dependency discovered natively. */
export type NativeCompilerContextEffect = Readonly<{
	token: string;
	kind: 'read' | 'write';
	confidence: 'exact' | 'unknown';
}>;

/** Explains one placement requirement retained through callable propagation. */
export type NativeCompilerEnvironmentEffectSource = Readonly<{
	environment: 'browser' | 'server' | 'unknown';
	description: string;
	path: readonly string[];
}>;

/** Describes one local callable dependency. */
export type NativeCompilerCallEdge = Readonly<{
	id: string;
	name: string;
	targetId?: string;
	moduleSpecifier?: string;
	exportName?: string;
	resolved: boolean;
	receiverBindings?: readonly Readonly<{
		parameterIndex: number;
		source: 'component' | 'parameter' | 'unknown';
		sourceParameterIndex?: number;
		/** Argument access path relative to its source receiver. */
		path?: string[];
	}>[];
}>;

/** Contains the completed native effect summary for one source callable. */
export type NativeCompilerCallable = Readonly<{
	id: string;
	name: string;
	kind: 'function' | 'method' | 'component' | 'task' | 'initializer' | 'module-initializer';
	exportNames: readonly string[];
	directEffect: 'neutral' | 'browser' | 'server' | 'mixed' | 'unknown';
	effect: 'neutral' | 'browser' | 'server' | 'mixed' | 'unknown';
	directEffectSources: readonly NativeCompilerEnvironmentEffectSource[];
	effectSources: readonly NativeCompilerEnvironmentEffectSource[];
	calls: readonly NativeCompilerCallEdge[];
	artifactTargets: readonly ('client' | 'server')[];
	stateReads: readonly NativeCompilerStateEffect[];
	stateWrites: readonly NativeCompilerStateEffect[];
	contexts: readonly NativeCompilerContextEffect[];
	reevaluationSafe: boolean;
}>;
