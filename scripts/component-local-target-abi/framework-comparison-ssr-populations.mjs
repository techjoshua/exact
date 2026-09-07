import { samplePopulation } from './framework-comparison-adapter-support.mjs';
import { requestDistributionPopulation } from './framework-comparison-reported-population.mjs';

/** Preserves separate request, CPU, event-loop, aggregate, and load-interval populations. */
export function requestPopulations(lanes) {
	const populations = [
		requestDistributionPopulation(
			'client requests',
			['clientTtfbMs', 'clientTotalMs', 'responseBytes'],
			lanes.clientCounts,
			lanes.clientRaw,
			lanes.clientReported
		),
		requestDistributionPopulation(
			'worker requests',
			['workerFirstByteMs', 'workerTotalMs', 'workerDeliveryMs'],
			lanes.workerCounts,
			lanes.workerRaw,
			lanes.workerReported
		),
		requestDistributionPopulation(
			'worker CPU batches',
			['workerUserCpuPerRequestMs', 'workerSystemCpuPerRequestMs', 'workerTotalCpuPerRequestMs'],
			lanes.workerCpuCounts,
			lanes.workerCpuRaw,
			lanes.workerCpuReported
		),
		{
			name: 'event-loop histogram',
			kind: 'reported',
			metrics: ['eventLoopDelayMs'],
			rawSummaries: lanes.eventLoopRaw
		},
		samplePopulation('lane aggregates', lanes.aggregateMetrics, 1, 0, lanes.aggregateRaw)
	];
	if (lanes.participantWorkReported.length)
		populations.push(
			requestDistributionPopulation(
				'participant work',
				['workerParticipantWorkMs'],
				lanes.participantWorkCounts,
				lanes.participantWorkRaw,
				lanes.participantWorkReported
			)
		);
	if (lanes.throughputRaw.length)
		populations.push(
			samplePopulation(
				'load intervals',
				lanes.hasBurstElapsed ? ['requestsPerSecond', 'burstElapsedMs'] : ['requestsPerSecond'],
				lanes.throughputCount,
				0,
				lanes.throughputRaw
			)
		);
	return populations;
}
