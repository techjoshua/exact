import type { ExactProfileEvent, ExactProfileSink } from '@exactjs/instrumentation';
import type { NativeCompilerProcessOptions } from '../native/process.js';

/** Observable resource totals for a native compiler session. */
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

/** Configures one persistent native compiler session. */
export type ExactCompilerSessionOptions = Readonly<{
	/** Overrides the platform-native compiler process. */
	nativeCompiler?: NativeCompilerProcessOptions;
	/** Receives compiler profiling observations. */
	onProfile?: ExactProfileSink<ExactCompilerProfileEvent>;
}>;

/** Compiler-owned profiling phases emitted around native work. */
export type ExactCompilerProfileEvent = ExactProfileEvent<
	'compiler',
	'native-request' | 'invalidate' | 'clear'
>;

/** Describes files affected by an incremental invalidation. */
export type ExactCompilerInvalidation = Readonly<{
	affectedFiles: readonly string[];
	diagnostics: readonly Readonly<{
		code: string;
		message: string;
		filename?: string;
		span?: Readonly<{ line: number; column: number }>;
	}>[];
}>;
