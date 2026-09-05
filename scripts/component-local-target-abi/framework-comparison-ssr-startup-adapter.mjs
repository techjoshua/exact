import { createSuite } from './framework-comparison-adapter-support.mjs';

/** Adapts the isolated process-startup population for one SSR runtime. */
export function createSsrStartupSuite(raw, runtime, entries) {
	const adapted = Object.fromEntries(
		Object.entries(entries).map(([name, entry]) => [
			name,
			{
				samples: entry.startupSamplesMs.map((startupMs) => ({ startupMs })),
				summary: { startupMs: entry.startupMs },
				response: entry.response
			}
		])
	);
	return createSuite({
		name: `framework-comparison-ssr-${runtime}-startup`,
		entries: adapted,
		metrics: { startupMs: (sample) => sample.startupMs },
		sampleCount: raw.harness?.startupSampleCount,
		warmupCount: 0,
		artifactHash: (name) => raw.artifacts?.[runtime]?.[name]?.hash,
		responseHash: (_name, entry) => entry.response?.hash,
		requireEquivalentResponses: false
	});
}
