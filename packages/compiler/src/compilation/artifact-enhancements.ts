import path from 'node:path';
import type { ModuleRewriteOptions, TransformResult } from '../types.js';
import { exactEnhancementFacadeRequest } from './enhancement-facades.js';
import { prependExactEnhancementRegistrations } from './enhancement-registrations.js';

/**
 * Retains portable optional-provider edges in paired artifacts. Availability and authorization
 * belong to the consuming adapter, never the machine publishing these artifacts.
 */
export function linkArtifactEnhancements(
	result: TransformResult,
	inputFile: string,
	outputFile: string,
	rewrite?: ModuleRewriteOptions
): TransformResult {
	if (!result.rendererEnhancements?.length) return result;
	const enhancements = result.rendererEnhancements.map((entry) => {
		const alias = rewrite?.moduleAliases?.[entry.moduleSpecifier];
		let moduleSpecifier = alias ?? entry.moduleSpecifier;
		if (!alias && moduleSpecifier.startsWith('.')) {
			moduleSpecifier = path
				.relative(path.dirname(outputFile), path.resolve(path.dirname(inputFile), moduleSpecifier))
				.split(path.sep)
				.join('/');
			if (!moduleSpecifier.startsWith('.')) moduleSpecifier = `./${moduleSpecifier}`;
		}
		return { ...entry, moduleSpecifier };
	});
	const code =
		`/// <reference path=${JSON.stringify(path.basename(outputFile) + '.enhancements.d.ts')} />\n` +
		prependExactEnhancementRegistrations(result.code, enhancements);
	return {
		...result,
		code,
		// Registration is a generated prefix, so shift the native mappings without resampling
		// them through a line-only map that would discard authored column precision.
		map: result.map
			? {
					...result.map,
					mappings:
						';'.repeat(code.slice(0, code.length - result.code.length).split('\n').length - 1) +
						result.map.mappings
				}
			: null,
		rendererEnhancements: enhancements
	};
}

/** Supplies type-only contracts for portable provider edges without selecting their implementation.
 * Repeated function declarations merge as overloads when several artifacts share one provider.
 */
export function artifactEnhancementDeclarations(result: TransformResult): string | undefined {
	if (!result.rendererEnhancements?.length) return undefined;
	return (
		[...new Set(result.rendererEnhancements.map(exactEnhancementFacadeRequest))]
			.map(
				(specifier) =>
					`declare module ${JSON.stringify(specifier)} { export default function enhancement(...args: never[]): unknown; }`
			)
			.join('\n') + '\n'
	);
}
