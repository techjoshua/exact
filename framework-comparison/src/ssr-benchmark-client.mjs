import { createHash } from 'node:crypto';
import { Agent, request } from 'node:http';
import { performance } from 'node:perf_hooks';

let clientAgent = createClientAgent();

/** Measures one complete warm keep-alive SSR response in the benchmark client's time domain. */
export async function measureSsrRequest(url) {
	const startedAt = performance.now();
	const { statusCode, ttfbMs, bytes } = await requestBody(url, startedAt);
	const totalMs = performance.now() - startedAt;
	if (statusCode < 200 || statusCode >= 300)
		throw new Error(`SSR request failed with ${statusCode}: ${bytes.toString('utf8')}`);
	return {
		ttfbMs,
		totalMs,
		bytes: bytes.length,
		hash: createHash('sha256').update(bytes).digest('hex'),
		meaningful: bytes.includes(Buffer.from('Delayed fulfillment events'))
	};
}

/** Closes the exact sockets owned by the load client after one participant worker is gone. */
export function resetSsrClientConnections() {
	clientAgent.destroy();
	clientAgent = createClientAgent();
}

/** Completes a finite request population without exceeding the selected client concurrency. */
export async function runConcurrentSsrRequests(url, count, maximumConcurrency) {
	const samples = new Array(count);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(count, maximumConcurrency) }, async () => {
			while (next < count) {
				const index = next++;
				samples[index] = await measureSsrRequest(url);
			}
		})
	);
	return samples;
}

/**
 * Drives one sustained closed-loop load window.
 * Requests begun before the deadline are allowed to settle so the caller never abandons sockets.
 */
export async function runSustainedSsrWindow(url, maximumConcurrency, durationMs) {
	if (!Number.isInteger(maximumConcurrency) || maximumConcurrency <= 0)
		throw new TypeError('SSR sustained concurrency must be a positive integer');
	if (!Number.isFinite(durationMs) || durationMs <= 0)
		throw new TypeError('SSR sustained duration must be positive');
	const samples = [];
	const startedAt = performance.now();
	const deadline = startedAt + durationMs;
	await Promise.all(
		Array.from({ length: maximumConcurrency }, async () => {
			do {
				samples.push(await measureSsrRequest(url));
			} while (performance.now() < deadline);
		})
	);
	const elapsedMs = performance.now() - startedAt;
	return {
		samples,
		elapsedMs,
		requestsPerSecond: (samples.length / elapsedMs) * 1_000
	};
}

function requestBody(url, startedAt) {
	return new Promise((resolveRequest, rejectRequest) => {
		const outgoing = request(
			url,
			{ agent: clientAgent, headers: { connection: 'keep-alive' } },
			(response) => {
				const ttfbMs = performance.now() - startedAt;
				const chunks = [];
				response.on('data', (chunk) => chunks.push(chunk));
				response.once('end', () =>
					resolveRequest({
						statusCode: response.statusCode ?? 0,
						ttfbMs,
						bytes: Buffer.concat(chunks)
					})
				);
				response.once('error', rejectRequest);
			}
		);
		outgoing.setTimeout(10_000, () => outgoing.destroy(new Error('SSR request timed out')));
		outgoing.once('error', rejectRequest);
		outgoing.end();
	});
}

function createClientAgent() {
	return new Agent({ keepAlive: true, maxSockets: 128, maxFreeSockets: 128, scheduling: 'lifo' });
}
