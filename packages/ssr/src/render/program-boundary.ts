import type { SsrContext } from '../types.js';
import type { RenderValue } from './execution.js';
import { SsrOutputLimitError } from './limits.js';
import { awaitSsrProgramSink, type SsrProgramSink } from './program-sink.js';
import type { SsrProgramWriterOutput } from './program-writer-output.js';

/**
 * Publishes an ordered boundary through a shared sink. Opening pressure precedes child work;
 * child rejection never emits the closing span. Pending descendants settle before flush failure
 * unwinds their owner's scope. Completion includes the closing span's drain.
 */
export function writeProgramBoundary(
	context: SsrContext,
	sink: SsrProgramSink,
	opening: string,
	closing: string,
	render: () => RenderValue<string>
): RenderValue<string> {
	const pending = openBoundary(context, sink, opening);
	return pending
		? pending.then(() => renderBoundary(context, sink, closing, render))
		: renderBoundary(context, sink, closing, render);
}

/** Accounts for opening output before checking pressure or starting child work. */
function openBoundary(
	context: SsrContext,
	sink: SsrProgramSink,
	opening: string
): RenderValue<void> {
	if (opening) {
		context.outputSink?.accountKnown(opening, opening.length);
		sink.write(opening);
	}
	return sink.ready();
}

/** Keeps the synchronous path direct while flushing before pending descendants. */
function renderBoundary(
	context: SsrContext,
	sink: SsrProgramSink,
	closing: string,
	render: () => RenderValue<string>
): RenderValue<string> {
	return publishBoundaryContent(context, sink, closing, render());
}

/** Shares pending-child flushing and closing publication across callback and program children. */
function publishBoundaryContent(
	context: SsrContext,
	sink: SsrProgramSink,
	closing: string,
	rendered: RenderValue<string>
): RenderValue<string> {
	return rendered instanceof Promise
		? awaitSsrProgramSink(sink, rendered).then((html) =>
				finishBoundary(context, sink, closing, html)
			)
		: finishBoundary(context, sink, closing, rendered);
}

/** Drains child output before publishing any closing marker. */
function finishBoundary(
	context: SsrContext,
	sink: SsrProgramSink,
	closing: string,
	html: string
): RenderValue<string> {
	if (html) sink.write(html);
	const pending = sink.ready();
	return pending
		? pending.then(() => closeBoundary(context, sink, closing))
		: closeBoundary(context, sink, closing);
}

/** An empty closing span creates no new pressure after the child has drained. */
function closeBoundary(
	context: SsrContext,
	sink: SsrProgramSink,
	closing: string
): RenderValue<string> {
	if (!closing) return '';
	context.outputSink?.accountKnown(closing, closing.length);
	sink.write(closing);
	const pending = sink.ready();
	return pending ? pending.then(() => '') : '';
}

/** Publishes a generated child/component position without collecting a deferred segment array. */
export function writeProgramChild<T>(
	context: SsrContext,
	output: SsrProgramWriterOutput<T>,
	value: T,
	id: string,
	characters: number,
	markerless = false
): RenderValue<number> {
	const marked = context.markers && !markerless;
	const opening = marked ? `<!--x:${id}-->` : '';
	const closing = marked ? `<!--/x:${id}-->` : '';
	const nextCharacters = characters + opening.length + closing.length;
	if (nextCharacters > context.maxOutputBytes)
		throw new SsrOutputLimitError(context.maxOutputBytes);
	const pending = openBoundary(context, output.sink, opening);
	const completed = pending
		? pending.then(() => renderProgramChild(context, output, value, closing))
		: renderProgramChild(context, output, value, closing);
	return completed instanceof Promise ? completed.then(() => nextCharacters) : nextCharacters;
}

/** Preserves the output receiver without allocating a forwarding callback per synchronous child. */
function renderProgramChild<T>(
	context: SsrContext,
	output: SsrProgramWriterOutput<T>,
	value: T,
	closing: string
): RenderValue<string> {
	return publishBoundaryContent(context, output.sink, closing, output.render(value));
}
