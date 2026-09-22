import { renderToString, renderToStream, renderToHydratableString } from '@exactjs/ssr';
import type { ObservePhase } from './profile-phases.js';
import { owners, population, type ComparisonKind } from './components.js';
export { measureIntlRequests } from './intl-requests.js';

/** Creates a matching adoption input outside the timed hydration region. */
export async function hydrationOutput(kind: ComparisonKind, count: number) {
	try {
		return await renderToHydratableString(population(kind, count));
	} finally {
		owners.length = 0;
	}
}

/** Measures complete string/stream rendering and first-byte latency with matching content. */
export async function measureServer(kind: ComparisonKind, count: number, observe?: ObservePhase) {
	owners.length = 0;
	observe?.('string', true);
	const started = performance.now();
	const result = await renderToString(population(kind, count));
	const stringMs = performance.now() - started;
	observe?.('string', false);
	observe?.('stream', true);
	const streamStart = performance.now();
	const reader = renderToStream(population(kind, count)).getReader();
	try {
		const first = await reader.read();
		const firstByteMs = performance.now() - streamStart;
		let bytes = first.value?.byteLength ?? 0;
		for (;;) {
			const part = await reader.read();
			if (part.done) break;
			bytes += part.value.byteLength;
		}
		const streamMs = performance.now() - streamStart;
		observe?.('stream', false);
		const htmlBytes = new TextEncoder().encode(result.html).byteLength;
		if (bytes !== htmlBytes) throw new Error('String and stream size differ');
		return { stringMs, firstByteMs, streamMs, htmlBytes };
	} finally {
		reader.releaseLock();
		owners.length = 0;
	}
}
