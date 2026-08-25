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

/** Maps an unchanged generated suffix back to the exact code that preceded it. */
export function createGeneratedSuffixSourceMap(
	filename: string,
	source: string,
	generated: string
): ExactSourceMap {
	if (!generated.endsWith(source)) {
		throw new Error(`Generated output does not retain ${filename} as an unchanged suffix`);
	}
	const prefix = generated.slice(0, generated.length - source.length);
	if (prefix.length && !prefix.endsWith('\n') && !prefix.endsWith('\r')) {
		throw new Error(`Generated prefix for ${filename} must end at a line boundary`);
	}
	const prefixLines = prefix.length ? prefix.split(/\r\n|\r|\n/).length - 1 : 0;
	const sourceLines = Math.max(1, source.split(/\r\n|\r|\n/).length);
	const mappings = Array.from({ length: prefixLines }, () => '');
	for (let line = 0; line < sourceLines; line++) {
		mappings.push(line === 0 ? 'AAAA' : 'AACA');
	}
	return {
		version: 3,
		sources: [filename],
		sourcesContent: [source],
		names: [],
		mappings: mappings.join(';')
	};
}

/** Creates token-position mappings while leaving generated-only regions unmapped. */
export function createTokenSourceMap(
	filename: string,
	source: string,
	generated: string
): ExactSourceMap {
	const originals = scanSourceTokens(source);
	const generatedTokens = scanSourceTokens(generated);
	const segments = new Map<
		number,
		Array<{ column: number; sourceLine: number; sourceColumn: number }>
	>();
	let sourceCursor = 0;
	for (const token of generatedTokens) {
		let match = -1;
		const limit = Math.min(originals.length, sourceCursor + 256);
		for (let index = sourceCursor; index < limit; index++) {
			if (originals[index]!.text === token.text) {
				match = index;
				break;
			}
		}
		if (match < 0) continue;
		const original = originals[match]!;
		sourceCursor = match + 1;
		let line = segments.get(token.line);
		if (!line) segments.set(token.line, (line = []));
		line.push({
			column: token.column,
			sourceLine: original.line,
			sourceColumn: original.column
		});
	}
	return {
		version: 3,
		sources: [filename],
		sourcesContent: [source],
		names: [],
		mappings: encodeTokenMappings(lineCount(generated), segments)
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

type SourceToken = Readonly<{ text: string; line: number; column: number }>;

function scanSourceTokens(source: string): SourceToken[] {
	const tokens: SourceToken[] = [];
	let offset = 0;
	let line = 0;
	let column = 0;
	while (offset < source.length) {
		const startLine = line;
		const startColumn = column;
		const rest = source.slice(offset);
		const trivia = /^(?:\s+|\/\/[^\r\n]*(?:\r\n|\r|\n|$)|\/\*[\s\S]*?\*\/)/.exec(rest);
		if (trivia) {
			({ offset, line, column } = advancePosition(trivia[0], offset, line, column));
			continue;
		}
		const token =
			/^(?:[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*|(?:0[xob])?[\da-f]+(?:[._][\da-z]+)*(?:e[+-]?\d+)?n?|"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|`(?:\\.|[^`\\])*`|===|!==|>>>|\*\*|=>|==|!=|<=|>=|&&|\|\||\?\?|\?\.|\+\+|--|<<|>>|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|\.\.\.|.)/iu.exec(
				rest
			)?.[0];
		if (!token) break;
		tokens.push({ text: token, line: startLine, column: startColumn });
		({ offset, line, column } = advancePosition(token, offset, line, column));
	}
	return tokens;
}

function advancePosition(
	value: string,
	offset: number,
	line: number,
	column: number
): { offset: number; line: number; column: number } {
	for (let index = 0; index < value.length; index++) {
		const character = value[index]!;
		if (character === '\r') {
			if (value[index + 1] === '\n') index++;
			line++;
			column = 0;
		} else if (character === '\n') {
			line++;
			column = 0;
		} else {
			column++;
		}
	}
	return { offset: offset + value.length, line, column };
}

function encodeTokenMappings(
	generatedLines: number,
	segments: ReadonlyMap<
		number,
		readonly { column: number; sourceLine: number; sourceColumn: number }[]
	>
): string {
	let previousSourceLine = 0;
	let previousSourceColumn = 0;
	const lines: string[] = [];
	for (let line = 0; line < generatedLines; line++) {
		let previousGeneratedColumn = 0;
		lines.push(
			(segments.get(line) ?? [])
				.map((segment) => {
					const encoded =
						encodeVlq(segment.column - previousGeneratedColumn) +
						encodeVlq(0) +
						encodeVlq(segment.sourceLine - previousSourceLine) +
						encodeVlq(segment.sourceColumn - previousSourceColumn);
					previousGeneratedColumn = segment.column;
					previousSourceLine = segment.sourceLine;
					previousSourceColumn = segment.sourceColumn;
					return encoded;
				})
				.join(',')
		);
	}
	return lines.join(';');
}

function lineCount(value: string): number {
	return value.length ? value.split(/\r\n|\r|\n/).length : 1;
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
