import type { SsrContext } from '../types.js';

/** Creates the marker wrapper shared by one synchronous chunk traversal. */
export function createSsrChunkMarker(
	context: SsrContext
): (id: string, content: () => Generator<string>) => Generator<string> {
	return function* marked(id: string, content: () => Generator<string>): Generator<string> {
		if (context.markers) yield `<!--exact:${id}-->`;
		yield* content();
		if (context.markers) yield `<!--/exact:${id}-->`;
	};
}
