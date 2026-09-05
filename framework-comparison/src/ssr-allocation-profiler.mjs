import { summarizeCpuProfile, summarizeHeapSamplingProfile } from './client-profile-analysis.mjs';

/**
 * Samples allocations made by one Node-only diagnostic operation.
 * Bun returns an explicit unsupported result rather than importing Node inspector compatibility.
 */
export async function profileNodeAllocations(
	work,
	samplingIntervalBytes = 4 * 1024,
	includeRawProfile = false
) {
	if (globalThis.Bun) return { supported: false, reason: 'node-inspector-unavailable-on-bun' };
	const { Session } = await import('node:inspector/promises');
	const session = new Session();
	session.connect();
	try {
		await session.post('HeapProfiler.enable');
		await session.post('HeapProfiler.startSampling', {
			samplingInterval: samplingIntervalBytes,
			includeObjectsCollectedByMajorGC: true,
			includeObjectsCollectedByMinorGC: true
		});
		const value = await work();
		const { profile } = await session.post('HeapProfiler.stopSampling');
		const result = {
			supported: true,
			samplingIntervalBytes,
			value,
			summary: summarizeHeapSamplingProfile(profile)
		};
		return includeRawProfile ? { ...result, profile } : result;
	} finally {
		session.disconnect();
	}
}

/** Samples CPU used by one Node-only diagnostic operation. */
export async function profileNodeCpu(work, samplingIntervalMicroseconds = 100) {
	if (globalThis.Bun) return { supported: false, reason: 'node-inspector-unavailable-on-bun' };
	const { Session } = await import('node:inspector/promises');
	const session = new Session();
	session.connect();
	try {
		await session.post('Profiler.enable');
		await session.post('Profiler.setSamplingInterval', {
			interval: samplingIntervalMicroseconds
		});
		await session.post('Profiler.start');
		const value = await work();
		const { profile } = await session.post('Profiler.stop');
		return {
			supported: true,
			samplingIntervalMicroseconds,
			value,
			summary: summarizeCpuProfile(profile)
		};
	} finally {
		session.disconnect();
	}
}
