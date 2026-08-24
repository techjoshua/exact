import type { NativeCompilerContextEffect } from './process-contracts.js';

/** Describes one component declaration discovered inside the native process. */
export type NativeCompilerComponent = Readonly<{
	id: string;
	name: string;
	start: number;
	length: number;
	exported: boolean;
	signals: readonly string[];
	placement: 'client' | 'server' | 'isomorphic' | 'unknown';
	subgraphPlacement: 'client' | 'server' | 'isomorphic' | 'unknown';
	environmentEffect: 'neutral' | 'browser' | 'server' | 'mixed' | 'unknown';
	artifactTargets: readonly ('client' | 'server')[];
	renderEdges: readonly NativeCompilerRenderEdge[];
	clientIslandCount: number;
	contexts: readonly NativeCompilerContextEffect[];
	splitBoundaries: readonly string[];
	diagnostics: readonly string[];
	execution: NativeCompilerComponentExecution;
}>;

/** Canonical component-local execution subgraph produced by native analysis. */
export type NativeCompilerComponentExecution = Readonly<{
	version: 1;
	ports: readonly Readonly<{
		index: number;
		kind: 'state' | 'props' | 'context' | 'derived' | 'argument';
		path: string;
		direction: 'input' | 'output' | 'inout';
	}>[];
	transitions: readonly Readonly<{
		id: string;
		taskId: string;
		activation: 'setup' | 'interaction';
		placement: 'client' | 'server' | 'isomorphic';
		readiness: 'blocking' | 'nonblocking';
		concurrency: 'parallel' | 'latest' | 'queue';
		inputs: readonly number[];
		outputs: readonly number[];
	}>[];
	reactive: readonly Readonly<{
		name: string;
		provenance: 'state' | 'props' | 'context' | 'derived' | 'cell' | 'snapshot' | 'unknown';
		allocation: 'constant' | 'live-slot' | 'inline' | 'computed' | 'snapshot' | 'structural';
		dependencies: readonly string[];
	}>[];
}>;

/** Separates server activation requirements from browser resumption data. */
export type NativeCompilerComponentResumption = Readonly<{
	componentId: string;
	serverRender: Readonly<{
		stateReads: readonly string[];
		serverContexts: readonly NativeCompilerContextEffect[];
	}>;
	client: Readonly<{
		statePaths: readonly string[];
		stateInputs: readonly Readonly<{ statePath: string; propPath: string }>[];
		valueCaptures: readonly string[];
		contexts: readonly string[];
		boundaries: readonly string[];
	}>;
}>;

/** Describes one local component rendered by another component. */
export type NativeCompilerRenderEdge = Readonly<{
	id: string;
	nodeId?: string;
	tag: string;
	name: string;
	componentId?: string;
	moduleSpecifier?: string;
	exportName?: string;
	placement: 'client' | 'server' | 'isomorphic' | 'unknown';
	boundary: 'client' | 'server' | 'isomorphic' | 'unknown';
	index: number;
	path: string;
}>;
