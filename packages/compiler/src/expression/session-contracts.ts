import type {
	BoundModule,
	ExpressionDiagnostic,
	ExpressionProjectProfileEvent
} from '@exactjs/expressions';
import type { ExactProfileEvent, ExactProfileSink } from '@exactjs/instrumentation';
import type { NativeCompilerProcessOptions } from '../native/process.js';

/** Cached expression module state owned by a compiler session. */
export type ModuleCacheEntry = Readonly<{
	projectKey: string;
	filename: string;
	source: string;
	module: BoundModule;
	dependencies: readonly string[];
}>;

/** Controls how a source file participates in an expression project. */
export type ExpressionModuleOptions = Readonly<{
	root?: string;
	virtual?: boolean;
	diagnostics?: 'syntax' | 'full';
}>;

/** Observable resource and invalidation totals for a compiler session. */
export type ExactCompilerSessionStats = Readonly<{
	workspaces: number;
	rebuilds: number;
	semanticDiagnostics: number;
	modules: number;
	dependencyEntries: number;
	overlays: number;
	sourceFiles: number;
	nodeIdentityRoots: number;
	symbolIdentities: number;
	languageServices: number;
	languageServiceAffectedFiles: number;
	languageServiceSynchronizationMs: number;
}>;

/** Configures incremental services and optional profiling for a compiler session. */
export type ExactCompilerSessionOptions = Readonly<{
	languageService?: boolean;
	/** Selects the all-Go host by default; legacy is an explicit compatibility mode. */
	compiler?: 'native' | 'legacy';
	/** Enables the persistent all-Go compiler host for transform operations. */
	nativeCompiler?: NativeCompilerProcessOptions;
	/** Receives compiler and nested expression profiling observations. */
	onProfile?: ExactProfileSink<ExactCompilerProfileEvent | ExpressionProjectProfileEvent>;
}>;

/** Compiler-owned profiling phases emitted around expression work. */
export type ExactCompilerProfileEvent = ExactProfileEvent<
	'compiler',
	'expression-module' | 'invalidate' | 'clear'
>;

/** Describes files and diagnostics affected by an incremental invalidation. */
export type ExactCompilerInvalidation = Readonly<{
	affectedFiles: readonly string[];
	diagnostics: readonly ExpressionDiagnostic[];
}>;
