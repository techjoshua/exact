/** Rendering modes exercised by the normative composition corpus. */
export type CorpusMode =
	| 'client-mount'
	| 'client-update'
	| 'client-unmount'
	| 'ssr-sync'
	| 'ssr-async'
	| 'ssr-stream'
	| 'ssr-progressive'
	| 'hydrate-match'
	| 'hydrate-recover';

/** Stability class assigned to every compiler path known by the corpus. */
export type CompilerPathClass =
	| 'specialized'
	| 'supported-general'
	| 'explicit-compatibility'
	| 'diagnostic'
	| 'forbidden-legacy';

/** One compiler lowering, fallback, boundary, or rejected legacy architecture. */
export type CompilerPath = Readonly<{
	id: string;
	classification: CompilerPathClass;
	description: string;
	requiredModes: readonly CorpusMode[];
}>;

/** Hand-authored contract for one independently meaningful corpus scenario. */
export type CorpusScenario = Readonly<{
	id: string;
	description: string;
	fixture: string;
	compilerPaths: readonly string[];
	modes: readonly CorpusMode[];
}>;
