import {
	loadExactImportedManifests,
	matchesExactBuildFilter
} from '@exact/compiler/adapter-support';
import type { ExactCompilerManifest, TransformTarget } from '@exact/compiler';
import type { ExactPreparedCompilerRegistry } from '@exact/plugin-api';

type FilterPattern = string | RegExp | readonly (string | RegExp)[];

/** Defines the subset of Vite options that controls module compilation eligibility. */
export type ExactModuleSelectionOptions = {
	include?: FilterPattern;
	exclude?: FilterPattern;
	target?: TransformTarget;
	importedManifests?: readonly ExactCompilerManifest[];
	manifestFiles?: readonly string[];
};

/** Removes Vite query parameters while retaining virtual module identifiers. */
export function exactModuleFilename(id: string): string {
	return id.startsWith('\0') ? id : id.split('?', 1)[0]!;
}

/** Selects the concrete compiler target used by a client or server Vite build. */
export function exactTransformTarget(options: ExactModuleSelectionOptions): 'client' | 'server' {
	return options.target === 'server' ? 'server' : 'client';
}

/** Loads imported analysis manifests from the supported inline and file options. */
export function exactImportedManifests(
	options: ExactModuleSelectionOptions
): ExactCompilerManifest[] {
	return loadExactImportedManifests(options);
}

/** Determines whether compiler analysis is required for one authored module. */
export function shouldCompileExactModule(
	id: string,
	code: string,
	options: ExactModuleSelectionOptions,
	registry: ExactPreparedCompilerRegistry | undefined
): boolean {
	if (!options.include && /(?:^|[\\/])node_modules(?:[\\/]|$)/.test(id)) return false;
	if (options.include && !matchesExactBuildFilter(id, options.include)) return false;
	if (options.exclude && matchesExactBuildFilter(id, options.exclude)) return false;
	return (
		containsExactJsx(id, code) ||
		/@exact\s+[A-Za-z_$][\w$-]*\.[A-Za-z_$][\w$-]*/.test(code) ||
		Object.values(registry?.plugins ?? {}).some((plugin) => {
			const include = plugin.extension?.include;
			if (!include) return false;
			include.lastIndex = 0;
			return include.test(id);
		})
	);
}

/** Reports whether Vite supplied a JavaScript or TypeScript source module. */
export function isExactTransformableModule(id: string): boolean {
	return /\.[cm]?[jt]sx?(?:$|\?)/i.test(id);
}

/** Reports whether a JSX-bearing filename contains syntax requiring ownership analysis. */
export function containsExactJsx(id: string, code: string): boolean {
	return /\.[jt]sx(?:$|\?)/i.test(id) && code.includes('<');
}
