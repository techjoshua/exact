import type { RenderToStringOptions, SsrContext } from '../types.js';

const DEFAULT_MAX_TREE_DEPTH = 512;
const HARD_MAX_TREE_DEPTH = 1_024;
const DEFAULT_MAX_TREE_NODES = 100_000;
const DEFAULT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const DEFAULT_MAX_TASK_DURATION_MS = 30_000;

type SsrRenderOptions = RenderToStringOptions & { taskDeadline?: number };

/** Signals that SSR traversal exceeded its configured nesting limit. */
export class SsrTreeDepthError extends Error {
	constructor(limit: number) {
		super(`eXact SSR tree exceeds the configured maximum depth of ${limit}`);
		this.name = 'SsrTreeDepthError';
	}
}

/** Signals that observed component tasks exceeded the request deadline. */
export class SsrTaskDeadlineError extends Error {
	constructor() {
		super('SSR task duration limit exceeded');
		this.name = 'SsrTaskDeadlineError';
	}
}

/** Signals that SSR traversal processed too many render values. */
export class SsrTreeNodeError extends Error {
	constructor(limit: number) {
		super(`eXact SSR tree exceeds the configured maximum of ${limit} render values`);
		this.name = 'SsrTreeNodeError';
	}
}

/** Signals that encoded SSR output exceeded its byte budget. */
export class SsrOutputLimitError extends Error {
	constructor(limit: number) {
		super(`eXact SSR output exceeds the configured maximum of ${limit} bytes`);
		this.name = 'SsrOutputLimitError';
	}
}

/** Default maximum number of render values processed by one SSR operation. */
export const defaultMaxSsrTreeNodes = DEFAULT_MAX_TREE_NODES;

/** Default maximum encoded bytes produced by one SSR operation. */
export const defaultMaxSsrOutputBytes = DEFAULT_MAX_OUTPUT_BYTES;

/** Normalizes a positive integer limit or returns its domain default. */
export function normalizePositiveLimit(value: number | undefined, fallback: number): number {
	return Number.isSafeInteger(value) && value! > 0 ? value! : fallback;
}

/** Normalizes a caller-provided depth limit and applies the hard safety cap. */
export function normalizeSsrTreeDepth(value: number | undefined): number {
	return Number.isSafeInteger(value) && value! > 0
		? Math.min(value!, HARD_MAX_TREE_DEPTH)
		: DEFAULT_MAX_TREE_DEPTH;
}

/** Charges one render value against the context's traversal budget. */
export function countSsrNode(context: SsrContext): void {
	if (++context.traversedNodes > context.maxTreeNodes) {
		throw new SsrTreeNodeError(context.maxTreeNodes);
	}
}

/**
 * Joins output while preventing a large intermediate string from being built.
 */
export function boundedJoin(context: SsrContext, chunks: readonly string[]): string {
	let characters = 0;
	for (const chunk of chunks) {
		characters += chunk.length;
		if (characters > context.maxOutputBytes) {
			throw new SsrOutputLimitError(context.maxOutputBytes);
		}
	}
	const html = chunks.join('');
	assertOutputCharacterBound(context, html);
	return html;
}

/**
 * Applies a constant-time conservative bound to a UTF-16 output string.
 *
 * UTF-8 is never shorter than its UTF-16 code-unit count. Exact byte counting
 * is reserved for roots to avoid rescanning every descendant at each ancestor.
 */
export function assertOutputCharacterBound(context: SsrContext, html: string): void {
	if (html.length > context.maxOutputBytes) {
		throw new SsrOutputLimitError(context.maxOutputBytes);
	}
}

/** Verifies the exact UTF-8 byte length when non-ASCII output requires it. */
export function assertOutputWithinLimit(context: SsrContext, html: string): void {
	assertOutputCharacterBound(context, html);
	if (
		/[^\x00-\x7f]/.test(html) &&
		new TextEncoder().encode(html).byteLength > context.maxOutputBytes
	) {
		throw new SsrOutputLimitError(context.maxOutputBytes);
	}
}

/** Runs a synchronous nested traversal while restoring depth on every exit. */
export function withSsrTreeDepth<T>(context: SsrContext, run: () => T): T {
	enterSsrTreeDepth(context);
	try {
		return run();
	} finally {
		leaveSsrTreeDepth(context);
	}
}

/** Runs an asynchronous nested traversal while restoring depth on every exit. */
export async function withSsrTreeDepthAsync<T>(
	context: SsrContext,
	run: () => Promise<T>
): Promise<T> {
	enterSsrTreeDepth(context);
	try {
		return await run();
	} finally {
		leaveSsrTreeDepth(context);
	}
}

/** Enters one traversal frame without allocating a callback closure. */
export function enterSsrTreeDepth(context: SsrContext): void {
	context.traversalDepth++;
	if (context.traversalDepth <= context.maxTreeDepth) return;
	context.traversalDepth--;
	throw new SsrTreeDepthError(context.maxTreeDepth);
}

/** Leaves a traversal frame entered by {@link enterSsrTreeDepth}. */
export function leaveSsrTreeDepth(context: SsrContext): void {
	context.traversalDepth--;
}

/** Adds one stable task deadline without extending an existing render deadline. */
export function withTaskDeadline<T extends RenderToStringOptions>(
	options: T
): T & { taskDeadline: number } {
	const existing = (options as SsrRenderOptions).taskDeadline;
	if (typeof existing === 'number') return options as T & { taskDeadline: number };
	const duration =
		Number.isSafeInteger(options.maxTaskDurationMs) && options.maxTaskDurationMs! > 0
			? options.maxTaskDurationMs!
			: DEFAULT_MAX_TASK_DURATION_MS;
	return { ...options, taskDeadline: Date.now() + duration };
}

/** Returns whether an error is one of the intentional SSR safety limits. */
export function isSsrRenderLimitError(
	error: unknown
): error is SsrTreeDepthError | SsrTreeNodeError | SsrOutputLimitError | SsrTaskDeadlineError {
	return (
		error instanceof SsrTreeDepthError ||
		error instanceof SsrTreeNodeError ||
		error instanceof SsrOutputLimitError ||
		error instanceof SsrTaskDeadlineError
	);
}

/** Returns whether rendering stopped because of a limit or request cancellation. */
export function isSsrRenderInterruption(error: unknown, signal?: AbortSignal): boolean {
	return isSsrRenderLimitError(error) || signal?.aborted === true;
}
