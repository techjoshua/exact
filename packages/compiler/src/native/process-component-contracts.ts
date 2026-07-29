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
}>;

/** Describes one local component rendered by another component. */
export type NativeCompilerRenderEdge = Readonly<{
	id: string;
	nodeId?: string;
	tag: string;
	name: string;
	componentId?: string;
	placement: 'client' | 'server' | 'isomorphic' | 'unknown';
	boundary: 'client' | 'server' | 'isomorphic' | 'unknown';
	index: number;
	path: string;
}>;
