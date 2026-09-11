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
	if (opening) {
		context.outputSink?.accountKnown(opening, opening.length);
		sink.write(opening);
	}
	const pending = sink.ready();
	return pending
		? pending.then(() => renderBoundary(context, sink, closing, render))
		: renderBoundary(context, sink, closing, render);
}

/** Keeps the synchronous path direct while flushing before pending descendants. */
function renderBoundary(
	context: SsrContext,
	sink: SsrProgramSink,
	closing: string,
	render: () => RenderValue<string>
): RenderValue<string> {
	const rendered = render();
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
	const completed = writeProgramBoundary(context, output.sink, opening, closing, () =>
		output.render(value)
	);
	return completed instanceof Promise ? completed.then(() => nextCharacters) : nextCharacters;
}
