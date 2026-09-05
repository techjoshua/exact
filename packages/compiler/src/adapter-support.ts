export { transformExactAdapterModule } from './compilation/adapter-transformation.js';
export {
	exactEnhancementFacadeImports,
	prependExactEnhancementRegistrations
} from './compilation/enhancement-registrations.js';
export {
	exactAvailableEnhancementFacadeSource,
	exactEnhancementFacadeRequest,
	exactUnavailableEnhancementFacadeSource,
	parseExactEnhancementFacadeRequest,
	type ExactEnhancementFacadeRequest
} from './compilation/enhancement-facades.js';
export {
	materializeExactPhysicalEnhancementFacades,
	type ExactPhysicalEnhancementFacade
} from './compilation/physical-enhancement-facades.js';
export { composeExactSourceMaps, isExactSourceMap } from './source-maps.js';
export type { ExactSourceMap } from './types.js';

/** A compiler diagnostic shape that build-tool integrations can report. */
export type ExactBuildDiagnostic = Readonly<{
	code: string;
	message: string;
	filename?: string;
	span?: Readonly<{ line: number; column: number }>;
}>;

/** A string, regular expression, or list used to filter build input paths. */
export type ExactBuildFilter = string | RegExp | readonly (string | RegExp)[];

/** Build-tool-neutral filters used before compatibility or compiler transformation. */
export type ExactBuildModuleSelectionOptions = Readonly<{
	include?: ExactBuildFilter;
	exclude?: ExactBuildFilter;
	compileTestModules?: boolean;
}>;

/** Rendering mode understood consistently by every build-tool adapter. */
export type ExactBuildRenderMode = 'universal' | 'client' | 'hydrate' | 'server-render';

/** Selects and validates the component-contract facet for one physical build target. */
export function exactComponentContractProjection(
	target: 'client' | 'server',
	mode: ExactBuildRenderMode | undefined
): import('./contracts/transform.js').ComponentContractProjection {
	if (target === 'server') {
		if (mode === undefined || mode === 'universal') return 'complete';
		if (mode === 'server-render') return 'server-render';
		throw new TypeError(`Client render mode ${mode} cannot compile a server target`);
	}
	if (mode === 'server-render')
		throw new TypeError('Server render mode cannot compile a client target');
	return mode === undefined || mode === 'universal' ? 'complete' : mode;
}

/**
 * Creates a stateful reporter that emits only newly introduced diagnostics.
 *
 * Invalidated files are removed from the retained set after each update, so a
 * diagnostic is reported again if it disappears and later returns.
 */
export function createExactDiagnosticReporter(): (
	update: Readonly<{
		affectedFiles: readonly string[];
		diagnostics: readonly ExactBuildDiagnostic[];
	}>,
	warn: (message: string) => void
) => void {
	const previous = new Map<string, Set<string>>();
	return (update, warn) => {
		const next = new Map<string, Set<string>>();
		for (const diagnostic of update.diagnostics) {
			const file = diagnostic.filename ?? '<project>';
			let keys = next.get(file);
			if (!keys) next.set(file, (keys = new Set()));
			const key = exactDiagnosticKey(diagnostic);
			keys.add(key);
			if (!previous.get(file)?.has(key)) warn(formatExactDiagnostic(diagnostic));
		}

		// Invalidation lets resolved diagnostics disappear from the retained view.
		for (const file of update.affectedFiles) previous.delete(file.replaceAll('\\', '/'));
		for (const [file, keys] of next) previous.set(file, keys);
	};
}

/** Returns the stable identity used to deduplicate one build diagnostic. */
export function exactDiagnosticKey(diagnostic: ExactBuildDiagnostic): string {
	return `${diagnostic.code}:${diagnostic.span?.line}:${diagnostic.span?.column}:${diagnostic.message}`;
}

/** Formats a compiler diagnostic consistently across build-tool integrations. */
export function formatExactDiagnostic(diagnostic: ExactBuildDiagnostic): string {
	const location = diagnostic.filename
		? `${diagnostic.filename}${diagnostic.span ? `:${diagnostic.span.line}:${diagnostic.span.column}` : ''}`
		: 'TypeScript';
	return `${location} - ${diagnostic.code}: ${diagnostic.message}`;
}

/** Tests a build path against a string/regular-expression filter collection. */
export function matchesExactBuildFilter(id: string, filter: ExactBuildFilter): boolean {
	const patterns = Array.isArray(filter) ? filter : [filter];
	return patterns.some((pattern) => {
		if (typeof pattern === 'string') return id.includes(pattern);
		pattern.lastIndex = 0;
		return pattern.test(id);
	});
}

/** Reports whether a build identifier names JavaScript or TypeScript source. */
export function isExactBuildSourceModule(id: string): boolean {
	return /\.[cm]?[jt]sx?(?:$|\?)/i.test(id);
}

/** Reports whether a module is an already lowered target artifact rather than authored source. */
export function isExactGeneratedArtifactModule(id: string): boolean {
	return /\.exact\.(?:client|server)\.[cm]?[jt]sx?(?:$|\?)/i.test(id);
}

/** Reports whether a JSX-bearing module contains syntax requiring ownership analysis. */
export function containsExactBuildJsx(id: string, source: string): boolean {
	return /\.[jt]sx(?:$|\?)/i.test(id) && source.includes('<');
}

/** Reports whether non-JSX source contains a lexical eXact component ownership signal. */
export function containsExactComponentSyntax(source: string): boolean {
	return (
		/\bthis\s*:\s*[^,)]*\bComponent\s*</.test(source) ||
		/\bthis\s*(?:\.\s*(?:state|onMount|onActivate|onDeactivate|onUnmount|onRender|own|map|reactive|getContext|hasContext|setContext)|\[)/.test(
			source
		) ||
		(/\bfunction\s+[A-Z][$\w]*\s*\(/.test(source) &&
			/\breturn\s*(?:\(\s*)?\(\s*[^)]*\)\s*=>/.test(source))
	);
}

/** Applies common include, exclude, and test-module filters before adapter transformation. */
export function shouldTransformExactBuildModulePath(
	id: string,
	options: ExactBuildModuleSelectionOptions
): boolean {
	// Target artifacts contain compiler runtime calls and component contracts by design. Feeding
	// them through an adapter a second time can duplicate lowering and reinterpret generated cells
	// as authored source. The host bundler still performs its ordinary TypeScript transpilation.
	if (isExactGeneratedArtifactModule(id)) return false;
	if (
		options.compileTestModules !== true &&
		/(?:^|[\\/])[^\\/]+\.(?:test|spec|jest)\.[cm]?[jt]sx?$/i.test(id)
	)
		return false;
	if (options.include && !matchesExactBuildFilter(id, options.include)) return false;
	if (options.exclude && matchesExactBuildFilter(id, options.exclude)) return false;
	return true;
}

/** Determines whether one source module requires native eXact compilation. */
export function shouldCompileExactBuildModule(
	id: string,
	source: string,
	options: ExactBuildModuleSelectionOptions
): boolean {
	if (!isExactBuildSourceModule(id)) return false;
	if (!options.include && /(?:^|[\\/])(?:node_modules|dist)(?:[\\/]|$)/.test(id)) return false;
	if (!shouldTransformExactBuildModulePath(id, options)) return false;
	// An explicit include is an ownership declaration, not merely a path prefilter. It also covers
	// hand-authored nonvisual TypeScript components that implement the target ABI without JSX.
	if (options.include) return true;
	return (
		containsExactBuildJsx(id, source) ||
		containsExactComponentSyntax(source) ||
		/@exact\s+[A-Za-z_$][\w$-]*\.[A-Za-z_$][\w$-]*/.test(source)
	);
}
