import type { SsrContext } from '../types.js';
import { withRenderCleanup, type RenderValue } from './execution.js';

/**
 * Keeps a boundary's markup local until wrappers, routing, or render retries finish.
 * Nested captures share the local mode. The outer destination is restored only after
 * descendant rendering and cleanup settle, including rejection and cancellation.
 */
export function captureSsrProgramOutput<T>(
	context: SsrContext,
	render: () => RenderValue<T>
): RenderValue<T> {
	const sink = context.writerSink;
	if (!sink) return render();
	context.writerSink = undefined;
	return withRenderCleanup(render, () => {
		context.writerSink = sink;
	});
}
