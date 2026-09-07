import { resolve } from 'node:path';
import { captureClientPage, startClientPageReplay } from './client-page-replay.mjs';
import { startComparisonServer } from './server.mjs';

/**
 * Owns a capture/replay lifecycle for the controlled client scenario. Live mode remains available
 * for end-to-end navigation measurements. Replay stops framework servers before timed samples.
 */
export async function startClientBenchmarkHarness(participants) {
	const mode = process.env.COMPARISON_CLIENT_MODE ?? 'replay';
	if (!['replay', 'live'].includes(mode))
		throw new Error('COMPARISON_CLIENT_MODE must be replay or live');
	const live = await import('./e2e-server.mjs');
	if (mode === 'live') return { close: live.close, evidence: () => ({ mode }) };
	const replays = [];
	let service;
	try {
		const captures = [];
		for (const participant of participants) {
			const reset = await fetch('http://127.0.0.1:4310/__benchmark/reset', {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'x-benchmark-control': 'fixture-reset' },
				body: '{}'
			});
			if (!reset.ok) throw new Error(`Capture fixture reset failed: ${reset.status}`);
			captures.push(
				await captureClientPage({
					id: participant.id,
					url: participant.url ?? `http://127.0.0.1:${participant.port}`,
					directory: resolve(
						import.meta.dirname,
						'../participants',
						participant.directory ?? participant.id,
						participant.artifact
					)
				})
			);
		}
		await live.close();
		service = await startComparisonServer();
		for (const capture of captures) replays.push(await startClientPageReplay(capture));
		return {
			close,
			evidence: () => ({
				mode,
				documentPath: '/incidents/inc-100',
				cache: 'disabled',
				transport: 'common-node-http-uncompressed-memory',
				frameworkServersStopped: true,
				captures: replays.map((replay) => replay.evidence())
			})
		};
	} catch (error) {
		await close();
		throw error;
	}

	async function close() {
		try {
			await Promise.all(replays.map((replay) => replay.close()));
		} finally {
			try {
				await service?.close();
			} finally {
				await live.close();
			}
		}
	}
}
