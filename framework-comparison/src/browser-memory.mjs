/**
 * Collects garbage in the measured page and returns its retained JavaScript heap in bytes.
 * The caller must enable the CDP Performance domain before invoking this operation.
 */
export async function measureRetainedHeap(session) {
	await session.send('HeapProfiler.collectGarbage');
	const metrics = await session.send('Performance.getMetrics');
	return metrics.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? null;
}
