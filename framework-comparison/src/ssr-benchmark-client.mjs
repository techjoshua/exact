import { Agent, request } from 'node:http';
import { performance } from 'node:perf_hooks';
import { hashStableSsrResponse } from './artifact-integrity.mjs';

let clientAgent = createClientAgent();

/** Measures one complete warm keep-alive SSR response in the benchmark client's time domain. */
export async function measureSsrRequest(url) {
	return validateResponse(await receiveSsrResponse(url));
}

async function receiveSsrResponse(url) {
	const startedAt = performance.now();
	const { statusCode, ttfbMs, bytes } = await requestBody(url, startedAt);
	const totalMs = performance.now() - startedAt;
	return { statusCode, ttfbMs, totalMs, bytes };
}

/** Validates a completed response only after its owning load interval has stopped. */
function validateResponse({ statusCode, ttfbMs, totalMs, bytes }) {
	if (statusCode < 200 || statusCode >= 300)
		throw new Error(`SSR request failed with ${statusCode}: ${bytes.toString('utf8')}`);
	return {
		ttfbMs,
		totalMs,
		bytes: bytes.length,
		hash: hashStableSsrResponse(bytes),
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
	return (await runSsrBurst(url, count, maximumConcurrency)).samples;
}

/**
 * Measures a positive finite burst through final response drain, excluding response validation.
 * Concurrency must be 1–128 to stay within the owned agent's socket capacity.
 */
export async function runSsrBurst(url, count, maximumConcurrency) {
	if (!Number.isInteger(count) || count <= 0)
		throw new TypeError('SSR burst count must be a positive integer');
	assertConcurrency(maximumConcurrency);
	const samples = new Array(count);
	let next = 0;
	const startedAt = performance.now();
	const settled = await Promise.allSettled(
		Array.from({ length: Math.min(count, maximumConcurrency) }, async () => {
			while (next < count) {
				const index = next++;
				samples[index] = await receiveSsrResponse(url);
			}
		})
	);
	const elapsedMs = performance.now() - startedAt;
	throwLoadFailure(settled);
	return { samples: samples.map(validateResponse), elapsedMs };
}

/**
 * Drives one sustained closed-loop load window.
 * Requests begun before the deadline are allowed to settle so the caller never abandons sockets.
 * Response bodies are retained for this window and validated after the elapsed timer stops.
 * Both request counts and elapsed time include final drain; validation is outside the load loop.
 * Duration must be positive and finite; concurrency must be 1–128.
 */
export async function runSustainedSsrWindow(url, maximumConcurrency, durationMs) {
	assertConcurrency(maximumConcurrency);
	if (!Number.isFinite(durationMs) || durationMs <= 0)
		throw new TypeError('SSR sustained duration must be positive');
	const samples = [];
	const startedAt = performance.now();
	const deadline = startedAt + durationMs;
	const settled = await Promise.allSettled(
		Array.from({ length: maximumConcurrency }, async () => {
			do {
				samples.push(await receiveSsrResponse(url));
			} while (performance.now() < deadline);
		})
	);
	const elapsedMs = performance.now() - startedAt;
	throwLoadFailure(settled);
	return {
		samples: samples.map(validateResponse),
		elapsedMs,
		requestsPerSecond: (samples.length / elapsedMs) * 1_000
	};
}

function assertConcurrency(value) {
	if (!Number.isInteger(value) || value <= 0 || value > 128)
		throw new TypeError('SSR client concurrency must be an integer from 1 through 128');
}

/** Waits for all owned request loops to drain before exposing a transport failure. */
function throwLoadFailure(settled) {
	const failure = settled.find((result) => result.status === 'rejected');
	if (failure) throw failure.reason;
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
