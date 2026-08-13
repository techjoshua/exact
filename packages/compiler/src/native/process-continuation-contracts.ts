import type { NativeCompilerContextEffect } from './process-contracts.js';
import type { NativeCompilerStateEffect } from './process-state-contracts.js';

/** Describes one compiler-owned cross-runtime task transition. */
export type NativeCompilerContinuation = Readonly<{
	id: string;
	kind: 'task';
	label?: string;
	componentId: string;
	taskId: string;
	placement: 'server' | 'isomorphic';
	readiness: 'blocking' | 'nonblocking';
	concurrency: 'parallel' | 'latest' | 'queue';
	async: boolean;
	activation: Readonly<{
		stateReads: readonly NativeCompilerStateEffect[];
		dependencies: readonly Readonly<{
			index: number;
			source: 'state' | 'props' | 'derived' | 'argument';
			path?: string;
		}>[];
		serverContexts: readonly NativeCompilerContextEffect[];
		publicContexts: readonly NativeCompilerContextEffect[];
	}>;
	effects: Readonly<{
		stateWrites: readonly NativeCompilerStateEffect[];
		contextWrites: readonly NativeCompilerContextEffect[];
		serverContextWrites: readonly NativeCompilerContextEffect[];
		boundaries: readonly string[];
	}>;
	ownership: Readonly<{
		componentId: string;
		lifetime: 'component' | 'invocation';
	}>;
	cancellation: 'abort-signal';
	invocation?: Readonly<{
		arguments: readonly Readonly<{
			index: number;
			source: 'argument';
			path?: string;
		}>[];
		concurrency: 'parallel' | 'latest' | 'queue';
	}>;
}>;
