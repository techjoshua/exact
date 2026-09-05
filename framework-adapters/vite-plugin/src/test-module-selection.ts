import type { ExactViteResolution } from './component-authorization.js';
import type { ExactPluginOptions } from './plugin-contracts.js';
import { exactModuleFilename, exactTestTargetRequest } from './module-selection.js';

type ExactViteResolver = (
	source: string,
	importer?: string
) => Promise<{ id: string; external?: boolean | 'absolute' | 'relative' } | null>;

/** Reports whether a resolution is compiler-owned test application source. */
export function isCompiledTestResolution(
	resolution: ExactViteResolution,
	options: ExactPluginOptions
): boolean {
	if (!options.compileTestModules || !resolution) return false;
	const id = exactModuleFilename(typeof resolution === 'string' ? resolution : resolution.id);
	return /(?:^|[\\/])[^\\/]+\.(?:test|spec|jest)\.[cm]?[jt]sx?$/i.test(id);
}

/** Resolves one test-only target projection while preserving the selected query identity. */
export async function resolveExactTestTargetRequest(
	source: string,
	importer: string | undefined,
	options: ExactPluginOptions,
	resolve: ExactViteResolver | undefined
): Promise<{ id: string; external?: boolean | 'absolute' | 'relative' } | undefined> {
	const targeted = exactTestTargetRequest(source, options);
	if (!targeted || !resolve) return undefined;
	const resolved = await resolve(targeted.request, importer);
	return resolved
		? { ...resolved, id: `${exactModuleFilename(resolved.id)}?${targeted.query}` }
		: undefined;
}
