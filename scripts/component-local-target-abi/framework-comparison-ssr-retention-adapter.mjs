import {
	capitalize,
	repeated,
	samplePopulation,
	withUnit
} from './framework-comparison-adapter-support.mjs';

/** Adapts post-GC checkpoints and bounded retained-byte slopes as separate populations. */
export function createSsrRetentionSuite(raw, runtime, entries) {
	const fields = ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'];
	const participants = [];
	const checkpointRaw = [];
	const slopeRaw = [];
	const artifactHashes = {};
	const responseHashes = {};
	let checkpointCount;
	for (const [name, entry] of Object.entries(entries)) {
		const retention = entry.retention;
		checkpointCount ??= retention.checkpoints.length;
		if (retention.checkpoints.length !== checkpointCount)
			throw new Error(`${runtime} SSR retention changed its checkpoint population`);
		const metrics = {};
		for (const field of fields) {
			metrics[`postGc${capitalize(field)}Bytes`] = withUnit(retention.postGcBytes[field], 'bytes');
			metrics[`${field}BytesPerRequest`] = repeated(
				retention.bytesPerRequest[field],
				'bytes/request'
			);
		}
		participants.push({ name, metrics });
		checkpointRaw.push({
			name,
			samples: retention.checkpoints.map((point) =>
				Object.fromEntries(
					fields.map((field) => [`postGc${capitalize(field)}Bytes`, point.memory[field]])
				)
			)
		});
		slopeRaw.push({
			name,
			samples: [
				Object.fromEntries(
					fields.map((field) => [`${field}BytesPerRequest`, retention.bytesPerRequest[field]])
				)
			]
		});
		artifactHashes[name] = raw.artifacts?.[runtime]?.[name]?.hash;
		responseHashes[name] = entry.response?.hash;
	}
	return {
		table: { suite: `framework-comparison-ssr-${runtime}-retention`, participants },
		populations: [
			samplePopulation(
				'post-GC checkpoints',
				fields.map((field) => `postGc${capitalize(field)}Bytes`),
				checkpointCount,
				0,
				checkpointRaw
			),
			samplePopulation(
				'retention slopes',
				fields.map((field) => `${field}BytesPerRequest`),
				1,
				0,
				slopeRaw
			)
		],
		artifactHashes,
		responseHashes
	};
}
