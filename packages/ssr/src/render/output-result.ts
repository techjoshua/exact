import { augmentDocumentBody, isExactDocumentHtml } from '../document.js';
import type { HydratableStringResult, RenderToStringResult } from '../types.js';
import {
	htmlChunksOf,
	ssrHtmlChunks,
	ssrHydratableChunks,
	type SsrChunkedResult
} from './output-buffer.js';

const resultStorage = Symbol('ssrResultStorage');

/** Request-local data stays on the result rather than in a newly allocated getter closure. */
interface HydratableResultStorage {
	readonly chunks: readonly string[];
	materialized: string | undefined;
	readonly resumptions:
		| HydratableStringResult['resumptions']
		| (() => HydratableStringResult['resumptions']);
}

type StoredHydratableResult = HydratableStringResult & {
	[resultStorage]: HydratableResultStorage;
};

/** Shared own accessors preserve lazy reads without retaining request state in accessor closures. */
const hydratableResultDescriptors = {
	htmlWithHydration: {
		enumerable: true,
		configurable: true,
		get(this: StoredHydratableResult) {
			const data = this[resultStorage];
			return (data.materialized ??=
				data.chunks.length === 1 ? data.chunks[0]! : data.chunks.join(''));
		}
	},
	resumptions: {
		enumerable: true,
		configurable: true,
		get(this: StoredHydratableResult) {
			const value = this[resultStorage].resumptions;
			return typeof value === 'function' ? value() : value;
		}
	}
};

/** Publishes completed HTML while retaining request-owned chunks for hydration insertion. */
export function createChunkedStringResult(
	chunks: readonly string[],
	state: unknown,
	hydrationTable?: RenderToStringResult['hydrationTable'],
	preloadLinks?: readonly string[],
	wallClockSnapshot?: number
): RenderToStringResult {
	// Retained document edges remain ropes until a consumer needs the complete plain markup.
	let html = '';
	for (const chunk of chunks) html += chunk;
	const result: RenderToStringResult & SsrChunkedResult = {
		html,
		state
	};
	if (wallClockSnapshot !== undefined) result.wallClockSnapshot = wallClockSnapshot;
	if (hydrationTable) result.hydrationTable = hydrationTable;
	if (preloadLinks?.length) result.preloadLinks = Object.freeze([...preloadLinks]);
	Object.defineProperty(result, ssrHtmlChunks, { value: chunks });
	return result;
}

/** Adds hydration output without flattening ordinary fragment-style HTML. */
export function createChunkedHydratableResult(
	result: RenderToStringResult,
	resumptions:
		| HydratableStringResult['resumptions']
		| (() => HydratableStringResult['resumptions']),
	hydrationScript: string
): HydratableStringResult {
	const htmlChunks = htmlChunksOf(result);
	const chunks = htmlChunks
		? augmentChunkedBody(htmlChunks, hydrationScript)
		: [augmentDocumentBody(result.html, hydrationScript)];
	const hydratable = {
		resumptions: undefined,
		htmlWithHydration: undefined,
		html: result.html,
		state: result.state,
		hydrationScript
	} as unknown as HydratableStringResult & SsrChunkedResult;
	Object.defineProperty(hydratable, 'resumptions', hydratableResultDescriptors.resumptions);
	Object.defineProperty(
		hydratable,
		'htmlWithHydration',
		hydratableResultDescriptors.htmlWithHydration
	);
	Object.defineProperty(hydratable, resultStorage, {
		value: {
			chunks,
			materialized: undefined,
			resumptions
		} satisfies HydratableResultStorage
	});
	if (result.wallClockSnapshot !== undefined)
		hydratable.wallClockSnapshot = result.wallClockSnapshot;
	if (result.hydrationTable) hydratable.hydrationTable = result.hydrationTable;
	if (result.preloadLinks) hydratable.preloadLinks = result.preloadLinks;
	Object.defineProperty(hydratable, ssrHtmlChunks, { value: htmlChunks ?? [result.html] });
	Object.defineProperty(hydratable, ssrHydratableChunks, { value: chunks });
	return hydratable;
}

/** Recognizes normalized document output across renderer chunk boundaries. */
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
	if (!insertion)
		throw new Error('Normalized eXact document output is missing its closing </body> element.');
	const augmentation = hydrationScript
		? `<!--exact:framework-body:start-->${hydrationScript}<!--exact:framework-body:end-->`
		: '';
	if (!augmentation) return chunks;
	const result = chunks.slice(0, insertion.chunkIndex);
	const chunk = chunks[insertion.chunkIndex]!;
	if (insertion.offset) result.push(chunk.slice(0, insertion.offset));
	result.push(augmentation, chunk.slice(insertion.offset));
	for (let index = insertion.chunkIndex + 1; index < chunks.length; index++)
		result.push(chunks[index]!);
	return result;
}

/** Searches from the document tail, preserving tokens split across arbitrary renderer chunks. */
function findLastBodyClose(
	chunks: readonly string[]
): { chunkIndex: number; offset: number } | undefined {
	const expected = '</body>';
	let matched = 0;
	for (let chunkIndex = chunks.length - 1; chunkIndex >= 0; chunkIndex--) {
		const chunk = chunks[chunkIndex]!;
		for (let index = chunk.length - 1; index >= 0; index--) {
			const code = asciiLower(chunk.charCodeAt(index));
			const expectedCode = expected.charCodeAt(expected.length - matched - 1);
			if (code === expectedCode) {
				matched++;
				if (matched === expected.length) return { chunkIndex, offset: index };
			} else matched = code === expected.charCodeAt(expected.length - 1) ? 1 : 0;
		}
	}
	return undefined;
}

function asciiLower(code: number): number {
	return code >= 65 && code <= 90 ? code + 32 : code;
}
