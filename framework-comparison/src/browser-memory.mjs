/**
 * Collects garbage in the measured page and returns its retained JavaScript heap in bytes.
 * The caller must enable the CDP Performance domain before invoking this operation.
 */
export async function measureRetainedHeap(session) {
	return (await measureRetainedMemory(session)).jsHeapUsedBytes;
}

/**
 * Collects garbage and returns the comparable browser-owned memory and DOM retention signals.
 * Runtime heap details distinguish JavaScript capacity from embedder and backing-store retention,
 * while DOM counters expose native objects that the JavaScript heap scalar cannot describe.
 */
export async function measureRetainedMemory(session) {
	await session.send('HeapProfiler.collectGarbage');
	const [performance, heap, dom] = await Promise.all([
		session.send('Performance.getMetrics'),
		session.send('Runtime.getHeapUsage'),
		session.send('Memory.getDOMCounters')
	]);
	const metrics = Object.fromEntries(
		performance.metrics.map((metric) => [metric.name, metric.value])
	);
	return {
		jsHeapUsedBytes: metrics.JSHeapUsedSize ?? heap.usedSize ?? null,
		jsHeapTotalBytes: metrics.JSHeapTotalSize ?? heap.totalSize ?? null,
		embedderHeapUsedBytes: heap.embedderHeapUsedSize ?? null,
		backingStorageBytes: heap.backingStorageSize ?? null,
		documents: dom.documents ?? null,
		nodes: dom.nodes ?? null,
		eventListeners: dom.jsEventListeners ?? null
	};
}
