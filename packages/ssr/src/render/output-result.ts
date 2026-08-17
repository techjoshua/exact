import { augmentDocumentBody, isExactDocumentHtml } from '../document.js';
import type { HydratableStringResult, RenderToStringResult } from '../types.js';
import {
	htmlChunksOf,
	ssrHtmlChunks,
	ssrHydratableChunks,
	type SsrChunkedResult
} from './output-buffer.js';

/** Creates a public string result backed by request-owned chunks and one lazy final join. */
export function createChunkedStringResult(
	chunks: readonly string[],
	state: unknown,
	hydrationTable?: RenderToStringResult['hydrationTable'],
	preloadLinks?: readonly string[],
	wallClockSnapshot?: number
): RenderToStringResult {
	let materialized: string | undefined;
	const result = {
		state,
		...(wallClockSnapshot === undefined ? {} : { wallClockSnapshot }),
		...(hydrationTable ? { hydrationTable } : {}),
		...(preloadLinks?.length ? { preloadLinks: Object.freeze([...preloadLinks]) } : {})
	} as RenderToStringResult & SsrChunkedResult;
	Object.defineProperty(result, 'html', {
		enumerable: true,
		get() {
			return (materialized ??= chunks.length === 1 ? chunks[0]! : chunks.join(''));
		}
	});
	Object.defineProperty(result, ssrHtmlChunks, { value: chunks });
	return result;
}

/** Adds hydration output without flattening ordinary fragment-style HTML. */
export function createChunkedHydratableResult(
	result: RenderToStringResult,
	resumptions: HydratableStringResult['resumptions'],
	hydrationScript: string
): HydratableStringResult {
	const htmlChunks = htmlChunksOf(result);
	const chunks = htmlChunks
		? augmentChunkedBody(htmlChunks, hydrationScript)
		: [augmentDocumentBody(result.html, hydrationScript)];
	let materialized: string | undefined;
	const hydratable = {
		get html() {
			return result.html;
		},
		state: result.state,
		...(result.wallClockSnapshot === undefined
			? {}
			: { wallClockSnapshot: result.wallClockSnapshot }),
		...(result.hydrationTable ? { hydrationTable: result.hydrationTable } : {}),
		...(result.preloadLinks ? { preloadLinks: result.preloadLinks } : {}),
		resumptions,
		hydrationScript
	} as HydratableStringResult & SsrChunkedResult;
	Object.defineProperty(hydratable, 'htmlWithHydration', {
		enumerable: true,
		get() {
			return (materialized ??= chunks.length === 1 ? chunks[0]! : chunks.join(''));
		}
	});
	Object.defineProperty(hydratable, ssrHtmlChunks, { value: htmlChunks ?? [result.html] });
	Object.defineProperty(hydratable, ssrHydratableChunks, { value: chunks });
	return hydratable;
}

/** Reports document output from chunks without flattening the rendered body. */
export function startsExactDocument(chunks: readonly string[]): boolean {
	const expected = '<!doctype html>';
	let matched = 0;
	for (const chunk of chunks) {
		for (let index = 0; index < chunk.length && matched < expected.length; index++) {
			if (chunk[index] !== expected[matched++]) return false;
		}
		if (matched === expected.length) return true;
	}
	return false;
}

/** Falls back to the normalized string predicate for non-chunked results. */
export function isExactDocumentResult(result: RenderToStringResult): boolean {
	const chunks = htmlChunksOf(result);
	return chunks ? startsExactDocument(chunks) : isExactDocumentHtml(result.html);
}

function augmentChunkedBody(chunks: readonly string[], hydrationScript: string): readonly string[] {
	if (!startsExactDocument(chunks)) return [...chunks, hydrationScript];
	const insertion = findLastBodyClose(chunks);
	if (insertion < 0)
		throw new Error('Normalized eXact document output is missing its closing </body> element.');
	const augmentation = hydrationScript
		? `<!--exact:framework-body:start-->${hydrationScript}<!--exact:framework-body:end-->`
		: '';
	const result: string[] = [];
	let offset = 0;
	for (const chunk of chunks) {
		const end = offset + chunk.length;
		if (insertion < offset || insertion >= end) result.push(chunk);
		else {
			const local = insertion - offset;
			if (local > 0) result.push(chunk.slice(0, local));
			if (augmentation) result.push(augmentation);
			if (local < chunk.length) result.push(chunk.slice(local));
		}
		offset = end;
	}
	return result;
}

function findLastBodyClose(chunks: readonly string[]): number {
	const expected = '</body>';
	let matched = 0;
	let offset = 0;
	let found = -1;
	for (const chunk of chunks) {
		for (let index = 0; index < chunk.length; index++, offset++) {
			const code = asciiLower(chunk.charCodeAt(index));
			const expectedCode = expected.charCodeAt(matched);
			if (code === expectedCode) {
				matched++;
				if (matched === expected.length) {
					found = offset - expected.length + 1;
					matched = 0;
				}
			} else matched = code === expected.charCodeAt(0) ? 1 : 0;
		}
	}
	return found;
}

function asciiLower(code: number): number {
	return code >= 65 && code <= 90 ? code + 32 : code;
}
