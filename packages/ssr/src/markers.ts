import { decodeExactMarkerPart, encodeExactMarkerPart } from '@exactjs/core';
import type { SsrContext } from './types.js';

/** Renders content inside a generated exact marker pair. */
export function withMarker(
	context: SsrContext,
	kind: string,
	key: string | undefined,
	render: () => string
): string {
	return markerPair(context, markerId(context, kind, undefined, key), render);
}

/** Renders a stable exact marker pair around sync or async HTML content. */
export function markerPair(context: SsrContext, id: string, render: () => string): string;
export function markerPair(
	context: SsrContext,
	id: string,
	render: () => Promise<string>
): Promise<string>;
export function markerPair(
	context: SsrContext,
	id: string,
	render: () => string | Promise<string>
): string | Promise<string> {
	if (!context.markers) return render();
	const rendered = render();
	if (rendered instanceof Promise) {
		return rendered.then((html) => `<!--exact:${id}-->${html}<!--/exact:${id}-->`);
	}
	return `<!--exact:${id}-->${rendered}<!--/exact:${id}-->`;
}

/** Allocates a marker id from render context, kind, optional name, and optional key. */
export function markerId(context: SsrContext, kind: string, name?: string, key?: string): string {
	return `${kind}:${context.nextId++}${name ? `:${encodeExactMarkerPart(name)}` : ''}${key ? `:${encodeExactMarkerPart(key)}` : ''}`;
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
	return `item:${encodeExactMarkerPart(key)}`;
}

/** Encodes arbitrary UTF-8 marker data without lossy HTML-comment sanitizing. */
export function encodeMarkerKey(value: string): string {
	return encodeExactMarkerPart(value);
}

/** Decodes marker data emitted by encodeMarkerKey; legacy safe keys pass through. */
export function decodeMarkerKey(value: string): string {
	return decodeExactMarkerPart(value);
}
