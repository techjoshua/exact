import type { TransformTarget } from '@exactjs/compiler';

type FilterPattern = string | RegExp | readonly (string | RegExp)[];

/** Defines the subset of Vite options that controls module compilation eligibility. */
export type ExactModuleSelectionOptions = {
	include?: FilterPattern;
	exclude?: FilterPattern;
	target?: TransformTarget;
	compileTestModules?: boolean;
};

/** Removes Vite query parameters while retaining virtual module identifiers. */
export function exactModuleFilename(id: string): string {
	return id.startsWith('\0') ? id : id.split('?', 1)[0]!;
}

/** Selects the concrete compiler target used by a client or server Vite build. */
export function exactTransformTarget(options: ExactModuleSelectionOptions): 'client' | 'server' {
	return options.target === 'server' ? 'server' : 'client';
}

/** Selects the target owned by one Vite transform or resolution request. */
export function exactViteRequestTarget(
	options: ExactModuleSelectionOptions,
	ssr: boolean | undefined
): 'client' | 'server' {
	return ssr ? 'server' : exactTransformTarget(options);
}

/** Rejects Vite build mode when it disagrees with the plugin's compiler target. */
export function assertExactViteBuildTarget(
	options: ExactModuleSelectionOptions,
	config: { command: 'build' | 'serve'; build?: { ssr?: boolean | string } }
): void {
	if (config.command !== 'build' || Boolean(config.build?.ssr) === (options.target === 'server'))
		return;
	throw new Error(
		config.build?.ssr
			? "eXact Vite SSR builds require exact({ target: 'server' })"
			: 'eXact Vite server targets require Vite build.ssr'
	);
}

/**
 * Selects a target override for a compiler-owned test module.
 *
 * Hydration integration tests sometimes need the same authored fixture compiled once for the
 * client and once for the server in one Vite graph. The query is deliberately unavailable to
 * ordinary application builds so production target ownership remains build-wide.
 */
export function exactTransformTargetForModule(
	id: string,
	options: ExactModuleSelectionOptions,
	requestTarget = exactTransformTarget(options)
): 'client' | 'server' {
	if (!options.compileTestModules) return requestTarget;
	const query = id.includes('?') ? id.slice(id.indexOf('?') + 1) : '';
	const selected = new URLSearchParams(query).get('exact-target');
	return selected === 'client' || selected === 'server' ? selected : requestTarget;
}

/** Returns only an explicitly selected test projection, excluding the build-wide default. */
export function exactTestModuleTarget(
	id: string,
	options: ExactModuleSelectionOptions
): 'client' | 'server' | undefined {
	if (!options.compileTestModules || !id.includes('?')) return undefined;
	const selected = new URLSearchParams(id.slice(id.indexOf('?') + 1)).get('exact-target');
	return selected === 'client' || selected === 'server' ? selected : undefined;
}

/** Separates a test-only target query before Vite remaps an authored `.js` specifier to TSX. */
export function exactTestTargetRequest(
	source: string,
	options: ExactModuleSelectionOptions
): Readonly<{ request: string; query: string }> | undefined {
	if (!options.compileTestModules || !source.includes('?')) return undefined;
	const separator = source.indexOf('?');
	const query = new URLSearchParams(source.slice(separator + 1));
	const selected = query.get('exact-target');
	if (selected !== 'client' && selected !== 'server') return undefined;
	return { request: source.slice(0, separator), query: query.toString() };
}
