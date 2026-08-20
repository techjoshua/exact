import { createTokenSourceMap, type TransformTarget } from '@exactjs/compiler';
import type { ReactCompatibilityBuildEngine } from '@exactjs/react-compat/build';
import type { ResolvedReactCompatibility } from '@exactjs/react-compat/plugin';

/** Applies React compatibility lowering and restores a useful source map for Vite. */
export function rewriteWithCompatibility(
	engine: ReactCompatibilityBuildEngine,
	lowered: string,
	id: string,
	target: TransformTarget | undefined,
	sourceMap: boolean | undefined,
	original: string
): { code: string; map: unknown } {
	const rewritten = engine.transformModule({
		id,
		source: lowered,
		format: 'module',
		target: target === 'server' ? 'server' : 'client',
		sourceMap: false
	});
	return {
		code: rewritten.code,
		map: sourceMap === false ? null : createTokenSourceMap(id, original, rewritten.code)
	};
}

/** Converts resolved package aliases to Vite's anchored regular-expression form. */
export function viteReactAliases(
	resolved: ResolvedReactCompatibility
): Array<{ find: RegExp; replacement: string }> {
	return Object.entries(resolved.aliases).map(([find, replacement]) => ({
		find: new RegExp(`^${find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
		replacement
	}));
}
