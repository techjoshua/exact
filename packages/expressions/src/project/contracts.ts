import type { ExactProfileEvent, ExactProfileSink } from '@exactjs/instrumentation';

/** Configuration for one TypeScript-backed expression project session. */
export interface ExpressionProjectOptions {
	readonly tsconfigPath?: string;
	readonly cwd?: string;
	/** Keeps independently supplied virtual sources out of TypeScript's shared script global scope. */
	readonly forceModuleDetection?: boolean;
	/** Controls diagnostic collection without disabling TypeChecker-backed binding. */
	readonly diagnostics?: 'syntax' | 'full';
	/** Receives opt-in phase timings and structural counters for profiling. */
	readonly onProfile?: ExactProfileSink<ExpressionProjectProfileEvent>;
	/**
	 * Controls instrumentation granularity.
	 *
	 * Detailed profiling samples internal projection stages and therefore adds
	 * per-node timing overhead. It should be enabled for investigations, not
	 * routine production telemetry.
	 */
	readonly profileDetail?: 'summary' | 'detailed';
}

/** Profiling observation emitted by expression project phases. */
export type ExpressionProjectProfileEvent = ExactProfileEvent<
	'expressions',
	| 'configuration'
	| 'program'
	| 'syntax-diagnostics'
	| 'semantic-diagnostics'
	| 'module-projection'
	| 'projection-identity'
	| 'projection-node-conversion'
	| 'projection-node-metadata'
	| 'projection-node-types'
	| 'projection-node-bindings'
	| 'projection-node-common'
	| 'projection-node-specialization'
	| 'projection-node-overhead'
	| 'projection-finalization'
	| 'projection-type-display'
	| 'projection-type-members'
	| 'projection-type-signatures'
	| 'projection-type-properties'
	| 'projection-type-arguments'
	| 'projection-type-directives'
	| 'projection-type-construction'
> &
	Readonly<{
		filename?: string;
		fileCount?: number;
		nodeCount?: number;
		typeCount?: number;
		shallowTypeCount?: number;
		symbolCount?: number;
		scopeCount?: number;
		typeCacheHits?: number;
		typeCacheMisses?: number;
		shallowTypeCacheHits?: number;
		shallowTypeCacheMisses?: number;
		checkerTypeQueries?: number;
		checkerSymbolQueries?: number;
		resolvedSignatureQueries?: number;
		directiveScans?: number;
		directiveCharacters?: number;
	}>;

/** Current retained-state counters for an expression project. */
export type ExpressionProjectStats = Readonly<{
	rebuilds: number;
	semanticDiagnostics: number;
	overlays: number;
	sourceFiles: number;
	nodeIdentityRoots: number;
	symbolIdentities: number;
}>;

/** Defines the type projection bucket type contract. */
export type TypeProjectionBucket =
	| 'display'
	| 'members'
	| 'signatures'
	| 'properties'
	| 'arguments'
	| 'directives'
	| 'construction';

/** Mutable counters shared by detailed projection instrumentation stages. */
export type ProjectionCounters = {
	typeCacheHits: number;
	typeCacheMisses: number;
	shallowTypeCacheHits: number;
	shallowTypeCacheMisses: number;
	checkerTypeQueries: number;
	checkerSymbolQueries: number;
	resolvedSignatureQueries: number;
	directiveScans: number;
	directiveCharacters: number;
};
