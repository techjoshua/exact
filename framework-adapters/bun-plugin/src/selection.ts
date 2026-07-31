import { resolveExactArtifactImport } from '@exactjs/compiler';
import { matchesExactBuildFilter } from '@exactjs/compiler/adapter-support';
import type { ExactBunPluginOptions } from './plugin.js';

/** Resolves the exact artifact target owned by a Bun build. */
export function targetFor(options: ExactBunPluginOptions): 'client' | 'server' {
	return options.target === 'server' ? 'server' : 'client';
}

/** Resolves a Bun import request for a .exact facade to a target artifact. */
export function resolveExactBunRequest(
	request: string,
	importer: string | undefined,
	options: ExactBunPluginOptions = {}
): string | null {
	return resolveExactArtifactImport(request, importer, targetFor(options))?.id ?? null;
}

/** Prepends eXact export conditions without duplicating existing conditions. */
export function mergeConditions(current: readonly string[], next: readonly string[]): string[] {
	return [...next, ...current.filter((condition) => !next.includes(condition))];
}

/** Decides whether one Bun-loaded module belongs to compiler transformation. */
export function shouldTransform(id: string, code: string, options: ExactBunPluginOptions): boolean {
	if (!/\.[cm]?[jt]sx?(?:$|\?)/.test(id)) return false;
	if (!options.include && /(?:^|[\\/])node_modules(?:[\\/]|$)/.test(id)) return false;
	if (
		options.compileTestModules !== true &&
		/(?:^|[\\/])[^\\/]+\.(?:test|spec|jest)\.[cm]?[jt]sx?$/i.test(id)
	)
		return false;
	if (options.include && !matchesExactBuildFilter(id, options.include)) return false;
	if (options.exclude && matchesExactBuildFilter(id, options.exclude)) return false;
	return (
		(/\.[jt]sx(?:$|\?)/i.test(id) && code.includes('<')) ||
		/@exact\s+[A-Za-z_$][\w$-]*\.[A-Za-z_$][\w$-]*/.test(code) ||
		Object.values(options.pluginRegistry?.plugins ?? {}).some((plugin) => {
			const include = plugin.extension?.include;
			if (!include) return false;
			include.lastIndex = 0;
			return include.test(id);
		})
	);
}
