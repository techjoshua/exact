import { brotliCompressSync, gzipSync } from 'node:zlib';

/** Measures one synchronous operation and returns its result. */
export function elapsed(operation) {
	const started = performance.now();
	const value = operation();
	return { duration: performance.now() - started, value };
}

/** Measures one synchronous operation and its observed heap growth. */
export function elapsedWithPeakHeap(operation) {
	globalThis.gc?.();
	const startingHeap = process.memoryUsage().heapUsed;
	let peakHeap = startingHeap;
	const sample = setInterval(() => {
		peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
	}, 0);
	const started = performance.now();
	try {
		const value = operation();
		peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
		return {
			duration: performance.now() - started,
			value,
			peakHeapBytes: Math.max(0, peakHeap - startingHeap)
		};
	} finally {
		clearInterval(sample);
	}
}

/** Measures one asynchronous operation and returns its result. */
export async function elapsedAsync(operation) {
	const started = performance.now();
	const value = await operation();
	return { duration: performance.now() - started, value };
}

/** Measures one asynchronous operation and its observed heap growth. */
export async function elapsedAsyncWithPeakHeap(operation) {
	globalThis.gc?.();
	const startingHeap = process.memoryUsage().heapUsed;
	let peakHeap = startingHeap;
	const sample = setInterval(() => {
		peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
	}, 0);
	const started = performance.now();
	try {
		const value = await operation();
		peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
		return {
			duration: performance.now() - started,
			value,
			peakHeapBytes: Math.max(0, peakHeap - startingHeap)
		};
	} finally {
		clearInterval(sample);
	}
}

/** Repeats an operation while retaining a result so engines cannot erase the loop. */
export function repeat(iterations, operation) {
	let result;
	for (let index = 0; index < iterations; index++) result = operation();
	return result;
}

/** Returns raw, gzip, and Brotli payload sizes. */
export function payloadBytes(prefix, value) {
	const payload = Buffer.from(value);
	return {
		[`${prefix}Bytes`]: payload.byteLength,
		[`${prefix}GzipBytes`]: gzipSync(payload).byteLength,
		[`${prefix}BrotliBytes`]: brotliCompressSync(payload).byteLength
	};
}
