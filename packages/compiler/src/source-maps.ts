import { createLineSourceMap as createGenericLineSourceMap } from '@exactjs/expressions';
import type { ExactSourceMap } from './types.js';

/** Creates a line source map. */
export function createLineSourceMap(
	filename: string,
	source: string,
	generated: string
): ExactSourceMap {
	return createGenericLineSourceMap(filename, source, generated);
}

/** Returns the source map file path for an emitted output file. */
export function sourceMapPathFor(outputFile: string): string {
	return `${outputFile}.map`;
}

/** Appends a sourceMappingURL comment to generated code. */
export function withSourceMappingUrl(code: string, mapFileName: string): string {
	const normalized = code.endsWith('\n') ? code : `${code}\n`;
	return `${normalized}//# sourceMappingURL=${mapFileName}\n`;
}

/** Adds or replaces the file field on a source map object. */
export function withSourceMapFile(map: ExactSourceMap, file: string): ExactSourceMap {
	return { ...map, file };
}
