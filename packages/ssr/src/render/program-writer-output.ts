import type { SsrContext } from '../types.js';
import { mapRenderValue, withRenderCleanup, type RenderValue } from './execution.js';
import { claimRootText, enterHostTag, leaveHost } from './host.js';
import { appendBoundedHtml } from './limits.js';
import { captureNestedEnhancementStringPrefix } from './operation-enhancement-routes.js';
import type { SsrProgramSink } from './program-sink.js';

/** Existing traversal owner whose methods can replace per-program forwarding closures. */
export interface SsrProgramRenderTarget<T> {
	/** Renders one child using the target's existing component ownership. */
	renderProgramSegment(value: T): RenderValue<string>;
	/** Prepares siblings under the same owner before serial traversal reaches them. */
	prepareProgramReferences(values: readonly T[]): AsyncDisposable | undefined;
}

/** Caller-owned output and preparation lifetime consumed by a generated continuation writer. */
export interface SsrProgramWriterOutput<T> {
	/** Request state consumed by stateless generated operation helpers. */
	readonly context: SsrContext;
	/** Destination shared by all completed spans in this program. */
	readonly sink: SsrProgramSink;
	/** Existing traversal object retained only when shared forwarding methods are selected. */
	readonly target?: SsrProgramRenderTarget<T>;
	/** Renders one prepared child or component through the existing recursive renderer. */
	readonly render: (value: T) => RenderValue<string>;
	/** Starts scheduled sibling work before serial traversal reaches its positions. */
	readonly prepareReferences?: (values: readonly T[]) => AsyncDisposable | undefined;
	/** Sibling frames not consumed during traversal remain owned until this program settles. */
	preparation?: AsyncDisposable;
}

/**
 * Executes a caller-output writer within document ancestry and prepared-sibling ownership.
 * The invocation is passed explicitly so callers can reuse an invoker across program positions.
 * Shared destinations remain request-owned. Captured programs retain local text through the
 * same writer operations, without exposing output before enhancement or retry boundaries commit.
 */
export function renderProgramWriter<T, Invocation = undefined>(
	context: SsrContext,
	host: string | undefined,
	invocation: Invocation,
	invoke: (output: SsrProgramWriterOutput<T>, invocation: Invocation) => unknown,
	render: ((value: T) => RenderValue<string>) | SsrProgramRenderTarget<T>,
	prepareReferences?: (values: readonly T[]) => AsyncDisposable | undefined
): RenderValue<string> {
	const local = context.writerSink ? undefined : new CapturedProgramSink(context);
	const output: SsrProgramWriterOutput<T> = {
		context,
		sink: context.writerSink ?? local!,
		target: typeof render === 'function' ? undefined : render,
		render: typeof render === 'function' ? render : renderWriterTargetSegment,
		prepareReferences:
			typeof render === 'function' ? prepareReferences : prepareWriterTargetReferences
	};
	if (
		host &&
		(host === 'html' ||
			host === 'head' ||
			host === 'body' ||
			(context.documentRootSeen && context.hostStack.at(-1) === 'html'))
	) {
		const entered = enterHostTag(context, host);
		return withRenderCleanup(
			() => {
				if (entered.prefix) {
					output.sink.write(entered.prefix);
					output.sink.captureDocumentBoundary?.();
				}
				return mapRenderValue(output.sink.ready(), () =>
					mapRenderValue(executeProgramWriter(output, invoke, local, invocation), (html) =>
						mapRenderValue(host === 'head' ? output.sink.flush('head') : undefined, () => html)
					)
				);
			},
			() => leaveHost(context, entered.tag)
		);
	}
	if (host && !context.hostStack.length) claimRootText(context);
	return executeProgramWriter(output, invoke, local, invocation);
}

/** Installed only for target-backed output; the target retains the original child owner. */
function renderWriterTargetSegment<T>(
	this: SsrProgramWriterOutput<T>,
	value: T
): RenderValue<string> {
	return this.target!.renderProgramSegment(value);
}

/** Preparation belongs to this output invocation even when its traversal target is shared. */
function prepareWriterTargetReferences<T>(
	this: SsrProgramWriterOutput<T>,
	values: readonly T[]
): AsyncDisposable | undefined {
	return this.target!.prepareProgramReferences(values);
}

/** Allocates completion callbacks only for pending work or owned sibling cleanup. */
function executeProgramWriter<T, Invocation>(
	output: SsrProgramWriterOutput<T>,
	invoke: (output: SsrProgramWriterOutput<T>, invocation: Invocation) => unknown,
	local: CapturedProgramSink | undefined,
	invocation: Invocation
): RenderValue<string> {
	let completed: unknown;
	try {
		completed = invoke(output, invocation);
	} catch (error) {
		return failProgramWriter(output, error);
	}
	return completed instanceof Promise
		? completed.then(
				(value) => completeProgramWriter(output, value, local),
				(error) => failProgramWriter(output, error)
			)
		: completeProgramWriter(output, completed, local);
}

/** Validates ownership before releasing unused prepared siblings, preserving primary errors. */
function completeProgramWriter<T>(
	output: SsrProgramWriterOutput<T>,
	completed: unknown,
	local: CapturedProgramSink | undefined
): RenderValue<string> {
	if (completed !== output)
		return failProgramWriter(
			output,
			new TypeError('Native server writer rejected its caller-owned output')
		);
	const html = local?.value ?? '';
	const preparation = output.preparation;
	return preparation
		? withRenderCleanup(
				() => html,
				() => Promise.resolve(preparation[Symbol.asyncDispose]())
			)
		: html;
}

/** Keeps cleanup failures secondary when a generated writer rejects or throws. */
function failProgramWriter<T>(
	output: SsrProgramWriterOutput<T>,
	error: unknown
): RenderValue<never> {
	const preparation = output.preparation;
	if (!preparation) throw error;
	return withRenderCleanup(
		() => {
			throw error;
		},
		() => Promise.resolve(preparation[Symbol.asyncDispose]())
	);
}

/** Local capture owns text only; the enclosing request retains exact byte validation. */
class CapturedProgramSink implements SsrProgramSink {
	value = '';
	constructor(private readonly context: SsrContext) {}
	/** Retains routed prefixes before appending the next completed span. */
	write(html: string): void {
		this.value = appendBoundedHtml(
			this.context,
			captureNestedEnhancementStringPrefix(this.context, this.value),
			html
		);
	}
	/** Local text collection introduces no transport pressure. */
	ready(): void {}
	/** Captured markup stays private until its owning boundary commits. */
	flush(): void {}
}
