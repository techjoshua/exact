import { matchesExactBuildFilter } from '@exactjs/compiler/adapter-support';
import type { ExactWebpackPluginOptions } from './plugin.js';

/** Resolves the compiler target used by a webpack transform. */
export function webpackTransformTarget(options: ExactWebpackPluginOptions): 'client' | 'server' {
	return options.target === 'server' ? 'server' : 'client';
}

/** Reports whether a webpack module is owned by the eXact transform. */
export function shouldTransformWebpackModule(
	id: string,
	code: string,
	options: ExactWebpackPluginOptions
): boolean {
	if (!/\.[cm]?[jt]sx?(?:$|\?)/.test(id)) return false;
	if (!options.include && /(?:^|[\\/])node_modules(?:[\\/]|$)/.test(id)) return false;
	if (options.include && !matchesExactBuildFilter(id, options.include)) return false;
	if (options.exclude && matchesExactBuildFilter(id, options.exclude)) return false;
	return (
		code.includes('<') ||
		/@exact\s+[A-Za-z_$][\w$-]*\.[A-Za-z_$][\w$-]*/.test(code) ||
		Object.values(options.pluginRegistry?.plugins ?? {}).some((plugin) => {
			const include = plugin.extension?.include;
			if (!include) return false;
			include.lastIndex = 0;
			return include.test(id);
		})
	);
}
