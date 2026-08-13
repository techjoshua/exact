import type { ExactActivationDecision } from './process-activation-contracts.js';

/** Native recursive client/server partition plan consumed by artifact and runtime lowering. */
export type NativeCompilerPartitionPlan = Readonly<{
	version: number;
	buildKey: string;
	roots: readonly string[];
	nodes: readonly NativeCompilerPartitionPlanNode[];
	edges: readonly NativeCompilerPartitionPlanEdge[];
}>;

/** One reusable component or structural template in a native partition plan. */
export type NativeCompilerPartitionPlanNode = Readonly<{
	id: string;
	kind:
		| 'component'
		| 'enhancement-component'
		| 'region'
		| 'conditional-template'
		| 'keyed-template'
		| 'readiness-boundary';
	componentContract?: string;
	ownerComponent: string;
	placement: 'client' | 'server' | 'either';
	artifactTargets: readonly ('client' | 'server')[];
	activation: 'server-only' | 'eager' | 'interaction' | 'inert';
	refreshAuthority: 'client' | 'server' | 'none';
	start: number;
	length: number;
	renderPath: readonly string[];
	childEdges: readonly string[];
	optional?: boolean;
	conservative?: boolean;
	reason?: string;
	activationDecision?: ExactActivationDecision;
}>;

/** One finite edge between reusable native partition templates. */
export type NativeCompilerPartitionPlanEdge = Readonly<{
	id: string;
	parent: string;
	child: string;
	kind:
		| 'component'
		| 'enhancement'
		| 'region'
		| 'branch'
		| 'keyed-item'
		| 'server-range'
		| 'client-range'
		| 'readiness';
	cardinality: 'one' | 'optional' | 'branch' | 'many-keyed';
	data: readonly Readonly<{
		id: string;
		kind: 'prop' | 'state' | 'capture' | 'public-context' | 'server-context-name';
		direction: 'client-to-server' | 'server-to-client' | 'host-resolved';
		transfer: 'snapshot' | 'ordered-delta' | 'opaque-identity' | 'context-lookup';
		residency: 'client' | 'server' | 'either';
		secret: boolean;
	}>[];
	fallback: string;
	start: number;
	length: number;
	renderPath: readonly string[];
}>;
