import { renderToString, renderToStream, renderToHydratableString } from '@exactjs/ssr';
import { enhancementPopulation, receivingOwners } from './enhancement-components.js';
import type { PopulationKind } from './enhancement-components.js';

/** Produces independently owned server output for matching client adoption measurements. */
export async function enhancementHydrationOutput(kind: PopulationKind, count: number) {
	try {
		return await renderToHydratableString(enhancementPopulation(kind, count));
	} finally {
		receivingOwners.length = 0;
	}
}

/** Measures request-complete output and first-byte latency for the same compiled populations. */
export async function measureEnhancementServer(kind: PopulationKind, count: number) {
	receivingOwners.length = 0;
	const start = performance.now();
	const result = await renderToString(enhancementPopulation(kind, count));
	const stringMs = performance.now() - start;
	const streamStart = performance.now();
	const reader = renderToStream(enhancementPopulation(kind, count)).getReader();
	try {
		const first = await reader.read();
		const firstByteMs = performance.now() - streamStart;
		let bytes = first.value?.byteLength ?? 0;
		for (;;) {
			const part = await reader.read();
			if (part.done) break;
			bytes += part.value.byteLength;
		}
		return {
			stringMs,
			firstByteMs,
			streamMs: performance.now() - streamStart,
			bytes,
			htmlBytes: new TextEncoder().encode(result.html).byteLength
		};
	} finally {
		reader.releaseLock();
		receivingOwners.length = 0;
	}
}
