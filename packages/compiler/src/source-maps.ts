import type { ExactSourceMap } from './types.js';
import remapping from '@jridgewell/remapping';

/** Composes a post-transform map with the compiler map it consumed. */
export function composeExactSourceMaps(
	transformed: ExactSourceMap,
	compiled: ExactSourceMap
): ExactSourceMap {
	return remapping([transformed, compiled], () => null) as ExactSourceMap;
}

/** Narrows a host transform's optional source-map value. */
export function isExactSourceMap(value: unknown): value is ExactSourceMap {
	if (!value || typeof value !== 'object') return false;
	const map = value as Partial<ExactSourceMap>;
	return (
		map.version === 3 &&
		Array.isArray(map.sources) &&
		Array.isArray(map.names) &&
		typeof map.mappings === 'string'
	);
}

/** Creates a conservative line-to-line source map without loading a JavaScript compiler. */
export function createLineSourceMap(
	filename: string,
	source: string,
	generated: string
): ExactSourceMap {
	const sourceLines = Math.max(1, source.split(/\r\n|\r|\n/).length);
	const generatedLines = Math.max(1, generated.split(/\r\n|\r|\n/).length);
	let previousSourceLine = 0;
	const mappings: string[] = [];
	for (let line = 0; line < generatedLines; line++) {
		const sourceLine = Math.min(line, sourceLines - 1);
		mappings.push(`AA${encodeVlq(sourceLine - previousSourceLine)}A`);
		previousSourceLine = sourceLine;
	}
	// The first segment has no previous source position.
	mappings[0] = 'AAAA';
	return {
		version: 3,
		sources: [filename],
		sourcesContent: [source],
		names: [],
		mappings: mappings.join(';')
	};
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

const base64Digits = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeVlq(value: number): string {
	let vlq = value < 0 ? (-value << 1) + 1 : value << 1;
	let encoded = '';
	do {
		let digit = vlq & 31;
		vlq >>>= 5;
		if (vlq > 0) digit |= 32;
		encoded += base64Digits[digit];
	} while (vlq > 0);
	return encoded;
}
