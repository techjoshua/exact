import type { NativeCompilerResponse } from '../native/process-contracts.js';

/** Default number of cold rich analyses retained by one language workspace. */
export const defaultMaxCachedAnalyses = 128;

/** Default estimated byte budget for cold rich analyses retained by one workspace. */
export const defaultMaxCachedAnalysisBytes = 32 * 1024 * 1024;

/** Validates a caller-provided cache limit or returns its default. */
export function positiveCacheLimit(
	value: number | undefined,
	fallback: number,
	name: string
): number {
	if (value === undefined) return fallback;
	if (!Number.isSafeInteger(value) || value <= 0)
		throw new TypeError(`${name} must be a positive safe integer`);
	return value;
}

/** Returns the UTF-8 storage size of retained source text. */
export function sourceBytes(source: string): number {
	return Buffer.byteLength(source, 'utf8');
}

/** Estimates the retained source and native analysis response size. */
export function estimateAnalysisBytes(source: string, response: NativeCompilerResponse): number {
	return sourceBytes(source) + Buffer.byteLength(JSON.stringify(response), 'utf8');
}

/** Adds measurement or entry-count values without intermediate reduction state. */
export function sum(values: readonly number[]): number {
	let total = 0;
	for (const value of values) total += value;
	return total;
}

/** Throws the language-service cancellation shape when a request was aborted. */
export function throwIfAborted(signal: AbortSignal | undefined): void {
	if (!signal?.aborted) return;
	const error = new Error('The eXact language request was cancelled');
	error.name = 'AbortError';
	throw error;
}

/** Creates the stable stale-generation error used before publishing superseded analysis. */
export function staleError(filename: string): Error {
	const error = new Error(`A newer document version superseded analysis for ${filename}`);
	error.name = 'ExactStaleLanguageResultError';
	return error;
}

/** Returns whether a changed file resets configured project ownership. */
export function isProjectConfiguration(filename: string): boolean {
	const basename = filename.split(/[\\/]/).at(-1)?.toLowerCase() ?? filename.toLowerCase();
	return (
		/^tsconfig(?:\..+)?\.json$/.test(basename) ||
		/^jsconfig(?:\..+)?\.json$/.test(basename) ||
		/^exact\.config\.[cm]?[jt]s$/.test(basename) ||
		basename === 'package.json'
	);
}

/** Returns whether a path participates in source analysis. */
export function isLanguageSource(filename: string): boolean {
	return /\.[cm]?[jt]sx?$/i.test(filename);
}
