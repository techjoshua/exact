import { performance } from 'node:perf_hooks';
import { summarizeSsrSamples } from './ssr-benchmark-statistics.mjs';
import { balancedRoundOrder } from './balanced-round-order.mjs';

/** Warms and measures the shared fixture service before one participant receives benchmark work. */
export async function probeControlledService(serviceUrl, requests = 100) {
	if (!Number.isInteger(requests) || requests <= 0)
		throw new TypeError('Controlled-service probe count must be a positive integer');
	const samplesMs = [];
	for (let index = 0; index < requests; index++) {
		const startedAt = performance.now();
		const [session, incidents] = await Promise.all([
			fetch(`${serviceUrl}/api/session`),
			fetch(`${serviceUrl}/api/incidents`)
		]);
		if (!session.ok || !incidents.ok)
			throw new Error(
				`Controlled-service probe failed: session=${session.status} incidents=${incidents.status}`
			);
		await Promise.all([session.arrayBuffer(), incidents.arrayBuffer()]);
		samplesMs.push(performance.now() - startedAt);
	}
	return { requests, samplesMs, summaryMs: summarizeSsrSamples(samplesMs) };
}

/** Rotates a stable participant list without mutating caller-owned order. */
export function rotateParticipants(participants, offset) {
	if (!participants.length) return [];
	const normalized = ((offset % participants.length) + participants.length) % participants.length;
	return [...participants.slice(normalized), ...participants.slice(0, normalized)];
}

/** Selects one rotation from a complete balanced measurement cycle. */
export function balancedParticipantOrder(participants, round, runtimeOffset = 0) {
	return balancedRoundOrder(participants, round, runtimeOffset);
}
