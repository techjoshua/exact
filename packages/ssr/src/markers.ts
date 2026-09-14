import { decodeExactMarkerPart, encodeExactMarkerPart } from '@exactjs/core';
import type { SsrContext } from './types.js';
import type { RenderValue } from './render/execution.js';
import { writeProgramBoundary } from './render/program-boundary.js';

/** Renders content inside a generated exact marker pair. */
export function withMarker(
	context: SsrContext,
	kind: string,
	key: string | undefined,
	render: () => string
): RenderValue<string> {
	return markerPair(context, markerId(context, kind, undefined, key), render);
}

/**
 * Renders a stable exact marker pair around available or pending HTML content.
 * Shared sinks own the spans and may suspend even when the child renders synchronously.
 * Opening pressure precedes child execution; closing pressure precedes completion.
 */
export function markerPair(
	context: SsrContext,
	id: string,
	render: () => string | Promise<string>
): string | Promise<string> {
	if (!context.markers) return render();
	const itemKey = id.startsWith('item:') ? id.slice('item:'.length) : undefined;
	const opening =
		itemKey === undefined ? (id ? `<!--exact:${id}-->` : '<!--x-->') : `<!--i:${itemKey}-->`;
	const closing =
		itemKey === undefined ? (id ? `<!--/exact:${id}-->` : '<!--/x-->') : `<!--/i:${itemKey}-->`;
	const sink = context.writerSink;
	if (sink) return writeProgramBoundary(context, sink, opening, closing, render);
	context.outputSink?.accountKnown(opening, opening.length);
	const rendered = render();
	if (rendered instanceof Promise) {
		return rendered.then((html) => {
			context.outputSink?.accountKnown(closing, closing.length);
			return `${opening}${html}${closing}`;
		});
	}
	context.outputSink?.accountKnown(closing, closing.length);
	return `${opening}${rendered}${closing}`;
}

/** Wraps output that already completed inside its component-local rollback boundary. */
export function finalizedMarkerPair(context: SsrContext, id: string, rendered: string): string {
	if (!context.markers) return rendered;
	const opening = id ? `<!--exact:${id}-->` : '<!--x-->';
	const closing = id ? `<!--/exact:${id}-->` : '<!--/x-->';
	context.outputSink?.accountKnown(opening, opening.length);
	context.outputSink?.accountKnown(closing, closing.length);
	return `${opening}${rendered}${closing}`;
}

/** Allocates a marker id from render context, kind, optional name, and optional key. */
export function markerId(context: SsrContext, kind: string, name?: string, key?: string): string {
	return formatMarkerId(kind, context.nextId++, name, key);
}

/** Formats an already reserved identity without advancing the render context. */
export function formatMarkerId(kind: string, ordinal: number, name?: string, key?: string): string {
	return `${kind}:${ordinal}${name ? `:${encodeMarkerKey(name)}` : ''}${key ? `:${encodeMarkerKey(key)}` : ''}`;
}

/** Adds rendered Suspense status to a previously allocated stable boundary identity. */
export function suspenseStatusMarkerId(identity: string, status: 'content' | 'fallback'): string {
	if (!identity.startsWith('suspense:'))
		throw new Error('Suspense marker identity must use the suspense kind');
	return `suspense-${status}${identity.slice('suspense'.length)}`;
}

/** Normalizes a compiler-provided exact marker id by removing a leading exact prefix. */
export function exactMarkerId(id: string): string {
	return id.startsWith('exact:') ? id.slice('exact:'.length) : id;
}

/** Creates the marker id used for one keyed list item. */
export function keyedItemMarkerId(key: string): string {
	return `item:${encodeMarkerKey(key)}`;
}

/** Encodes arbitrary UTF-8 marker data without lossy HTML-comment sanitizing. */
export function encodeMarkerKey(value: string): string {
	if (isDirectMarkerPart(value)) return value;
	return encodeExactMarkerPart(value);
}

/** Proves the canonical unescaped marker grammar without allocating a regular-expression match. */
function isDirectMarkerPart(value: string): boolean {
	if (!value.length) return false;
	let hyphen = false;
	for (let index = 0; index < value.length; index++) {
		const code = value.charCodeAt(index);
		if (code === 45) {
			if (hyphen) return false;
			hyphen = true;
			continue;
		}
		hyphen = false;
		if (
			(code >= 48 && code <= 57) ||
			(code >= 65 && code <= 90) ||
			(code >= 97 && code <= 122) ||
			code === 46 ||
			code === 95
		)
			continue;
		return false;
	}
	return true;
}

/** Decodes marker data emitted by encodeMarkerKey; directly encoded safe keys pass through. */
export function decodeMarkerKey(value: string): string {
	return decodeExactMarkerPart(value);
}
