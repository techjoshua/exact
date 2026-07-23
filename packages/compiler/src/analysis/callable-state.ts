import type { BoundModule, NodeRef, Variable } from '@exactjs/expressions';
import type { ExactModuleImportPlan } from '../assets.js';
import { type ExpressionWritePlan } from '../expression/writes.js';
import type {
	ExactArtifactTarget,
	ExactCallableSummaryIR,
	ExactCallEdgeIR,
	ExactCompilerManifest,
	ExactContextEffect,
	ExactEnvironmentEffectSourceIR,
	ExactStateEffect
} from '../types.js';

/** Defines the mutable callable type contract. */
export type MutableCallable = {
	id: string;
	nodeId: string;
	name: string;
	kind: ExactCallableSummaryIR['kind'];
	exportNames: string[];
	directSources: ExactEnvironmentEffectSourceIR[];
	sources: ExactEnvironmentEffectSourceIR[];
	calls: ExactCallEdgeIR[];
	directWrites: ExactStateEffect[];
	writes: ExactStateEffect[];
	directReads: ExactStateEffect[];
	reads: ExactStateEffect[];
	directContexts: ExactContextEffect[];
	contexts: ExactContextEffect[];
	seedTargets: ExactArtifactTarget[];
	executable: boolean;
	parameters: readonly Variable[];
};

/** Tracks the state owned by callable analysis. */
export type CallableAnalysisState = {
	module: BoundModule;
	stateAliases: ReadonlyMap<string, readonly string[]>;
	localVariables: ReadonlySet<Variable>;
	importedNames: ReadonlyMap<string, string>;
	functions: NodeRef[];
	callableByVariable: Map<string, MutableCallable>;
	initializerByVariable: Map<string, MutableCallable>;
	callableByNode: Map<string, MutableCallable>;
	callNodeIds: Map<string, string>;
	mutable: MutableCallable[];
	initializers: Map<string, NodeRef>;
	external: ReadonlyMap<string, ExactCallableSummaryIR>;
	importedManifests: readonly ExactCompilerManifest[];
	moduleImports?: ExactModuleImportPlan;
	knownCallEffects: ReadonlyMap<string, 'server' | 'client' | 'isomorphic'>;
	writePlan?: ExpressionWritePlan;
};
