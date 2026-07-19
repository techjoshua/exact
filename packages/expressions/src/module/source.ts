import type { EmitResult } from '../model.js';
import type { SourceTrivia } from '../module.js';

/** Performs the detect trivia domain operation. */
export function detectTrivia(source: string): SourceTrivia {
	const single = (source.match(/'/g) ?? []).length;
	const double = (source.match(/"/g) ?? []).length;
	const shebang = source.startsWith('#!')
		? source.slice(0, source.indexOf('\n') < 0 ? source.length : source.indexOf('\n'))
		: undefined;
	const directives = [...source.matchAll(/^[ \t]*(["'])([^"'\r\n]+)\1;?/gm)].map(
		(match) => match[2]!
	);
	return Object.freeze({
		newline: source.includes('\r\n') ? 'crlf' : 'lf',
		quote: single > double ? 'single' : 'double',
		...(shebang ? { shebang } : {}),
		directives: Object.freeze(directives)
	});
}

/** Performs the source map domain operation. */
export function sourceMap(
	filename: string,
	source: string,
	code: string,
	lineOrigins?: readonly number[]
): EmitResult['map'] {
	const lines = code.split(/\r?\n/).length;
	const sourceLines = source.split(/\r?\n/).length;
	let priorOriginalLine = 0;
	const mappings: string[] = [];
	for (let line = 0; line < lines; line++) {
		const originalLine = lineOrigins?.[line] ?? Math.min(line, Math.max(0, sourceLines - 1));
		mappings.push(`${vlq(0)}${vlq(0)}${vlq(originalLine - priorOriginalLine)}${vlq(0)}`);
		priorOriginalLine = originalLine;
	}
	return Object.freeze({
		version: 3 as const,
		file: filename,
		sources: Object.freeze([filename]),
		sourcesContent: Object.freeze([source]),
		names: Object.freeze([]),
		mappings: mappings.join(';')
	});
}

const base64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function vlq(value: number): string {
	let encoded = value < 0 ? (-value << 1) | 1 : value << 1;
	let output = '';
	do {
		let digit = encoded & 31;
		encoded >>>= 5;
		if (encoded) digit |= 32;
		output += base64[digit];
	} while (encoded);
	return output;
}
