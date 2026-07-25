import type { ExactPlacement } from './policy.js';

/** Explains why one value is retained in a browser resumption record. */
export type ExactResumptionFieldExplanation = Readonly<{
	kind: 'state' | 'capture' | 'context' | 'boundary';
	name: string;
	reason:
		| 'client-render-dependency'
		| 'server-continuation-result'
		| 'client-closure-capture'
		| 'shared-context-result'
		| 'dom-adoption';
}>;

/** Explains one compiler-generated transition between component runtimes. */
export type ExactContinuationExplanation = Readonly<{
	id: string;
	placement: Extract<ExactPlacement, 'server' | 'isomorphic'>;
	clientToServer: Readonly<{
		state: readonly string[];
		dependencies: readonly number[];
		publicContexts: readonly string[];
	}>;
	serverOnlyContexts: readonly string[];
	serverToClient: Readonly<{
		state: readonly string[];
		contexts: readonly string[];
		boundaries: readonly string[];
	}>;
}>;

/** Explains the generated runtime split for one authored component. */
export type ExactComponentExplanation = Readonly<{
	id: string;
	name: string;
	placement: ExactPlacement;
	artifactTargets: readonly ('client' | 'server')[];
	continuations: readonly ExactContinuationExplanation[];
	ssr: Readonly<{
		stateInputs: readonly string[];
		serverOnlyContexts: readonly string[];
		resumption: readonly ExactResumptionFieldExplanation[];
	}>;
}>;

/** Optional human- and tool-readable account of one compiler transform. */
export type ExactCompilerExplanation = Readonly<{
	filename: string;
	target: 'default' | 'client' | 'server';
	components: readonly ExactComponentExplanation[];
}>;
