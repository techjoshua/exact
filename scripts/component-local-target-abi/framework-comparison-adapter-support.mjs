/** Builds one percentile suite while retaining every raw scenario sample. */
export function createSuite({
	name,
	entries,
	metrics,
	sampleCount,
	warmupCount,
	artifactHash,
	responseHash,
	requireEquivalentResponses = true
}) {
	if (!Number.isSafeInteger(sampleCount) || sampleCount <= 0)
		throw new Error(`${name} omitted its sample population`);
	if (!entries || typeof entries !== 'object') throw new Error(`${name} omitted participants`);
	const participants = [];
	const rawSamples = [];
	const artifactHashes = {};
	const responseHashes = {};
	for (const [participantName, entry] of Object.entries(entries)) {
		if (!Array.isArray(entry.samples) || entry.samples.length !== sampleCount)
			throw new Error(`${name} ${participantName} has an incomplete sample population`);
		const samples = entry.samples.map((sample) =>
			readSample(name, participantName, sample, metrics)
		);
		const summary = {};
		for (const metricName of Object.keys(metrics)) {
			const reported = entry.summary?.[metricName];
			for (const percentile of ['p50', 'p75', 'p95', 'p99']) {
				if (!Number.isFinite(reported?.[percentile]))
					throw new Error(`${name} ${participantName} omitted ${metricName}.${percentile}`);
			}
			const mean =
				samples.reduce((total, sample) => total + sample[metricName], 0) / samples.length;
			summary[metricName] = Object.freeze({ unit: unitFor(metricName), mean, ...reported });
		}
		const artifact = artifactHash(participantName, entry);
		const response = responseHash(participantName, entry);
		if (typeof artifact !== 'string' || artifact.length === 0)
			throw new Error(`${name} ${participantName} omitted its production artifact hash`);
		if (typeof response !== 'string' || response.length === 0 || entry.response?.stable !== true)
			throw new Error(`${name} ${participantName} omitted a stable semantic response hash`);
		participants.push({ name: participantName, metrics: summary });
		rawSamples.push({ name: participantName, samples });
		artifactHashes[participantName] = artifact;
		responseHashes[participantName] = response;
	}
	if (requireEquivalentResponses && new Set(Object.values(responseHashes)).size !== 1)
		throw new Error(`${name} participant semantic responses differ`);
	return Object.freeze({
		table: Object.freeze({ suite: name, participants: Object.freeze(participants) }),
		populations: Object.freeze([
			Object.freeze({
				name: 'scenario samples',
				metrics: Object.freeze(Object.keys(metrics)),
				sampleCount,
				warmupCount,
				rawSamples: Object.freeze(rawSamples)
			})
		]),
		artifactHashes: Object.freeze(artifactHashes),
		responseHashes: Object.freeze(responseHashes)
	});
}

/** Backfills summaries from retained raw samples for older complete comparison captures. */
export function completeSampleSummaries(entries, metrics) {
	return Object.fromEntries(
		Object.entries(entries).map(([name, entry]) => [
			name,
			{
				...entry,
				summary: Object.fromEntries(
					Object.entries(metrics).map(([metricName, read]) => [
						metricName,
						entry.summary?.[metricName] ?? summarize(entry.samples.map(read))
					])
				)
			}
		])
	);
}

function summarize(values) {
	const finite = values.filter(Number.isFinite).sort((left, right) => left - right);
	return {
		mean: finite.reduce((sum, value) => sum + value, 0) / finite.length,
		...Object.fromEntries(
			[
				['p50', 0.5],
				['p75', 0.75],
				['p95', 0.95],
				['p99', 0.99]
			].map(([name, quantile]) => [
				name,
				finite[Math.min(finite.length - 1, Math.ceil(finite.length * quantile) - 1)]
			])
		)
	};
}

/** Builds one named raw population for a suite with several sampling lanes. */
export function samplePopulation(name, metrics, sampleCount, warmupCount, rawSamples) {
	return Object.freeze({
		name,
		kind: 'samples',
		metrics: Object.freeze(metrics),
		sampleCount,
		warmupCount,
		rawSamples: Object.freeze(rawSamples)
	});
}

/** Validates and labels one complete percentile summary. */
export function withUnit(summary, unit) {
	if (!summary || ['p50', 'p75', 'p95', 'p99'].some((name) => !Number.isFinite(summary[name])))
		throw new Error('SSR measurement omitted a complete percentile summary');
	return {
		unit,
		...(Number.isFinite(summary.mean) ? { mean: summary.mean } : {}),
		p50: summary.p50,
		p75: summary.p75,
		p95: summary.p95,
		p99: summary.p99
	};
}

/** Projects a single aggregate into the required complete percentile shape. */
export function repeated(value, unit) {
	if (!Number.isFinite(value)) throw new Error('SSR measurement omitted a finite aggregate');
	return { unit, mean: value, p50: value, p75: value, p95: value, p99: value };
}

/** Capitalizes one metric-path segment. */
export function capitalize(value) {
	return `${value[0].toUpperCase()}${value.slice(1)}`;
}

/** Builds a one-observation deterministic suite. */
export function createDeterministicSuite({
	name,
	entries,
	values,
	artifactHashes,
	responseHashes
}) {
	if (!entries || typeof entries !== 'object') throw new Error(`${name} omitted participants`);
	const participants = [];
	const rawSamples = [];
	let metricNames;
	for (const [participantName, entry] of Object.entries(entries)) {
		const record = values(entry);
		const names = Object.keys(record).sort();
		metricNames ??= names;
		if (JSON.stringify(names) !== JSON.stringify(metricNames))
			throw new Error(`${name} ${participantName} changed its metric inventory`);
		const metrics = {};
		for (const metricName of names) {
			const value = record[metricName];
			if (!Number.isFinite(value))
				throw new Error(`${name} ${participantName} omitted ${metricName}`);
			metrics[metricName] = {
				unit: unitFor(metricName),
				p50: value,
				p75: value,
				p95: value,
				p99: value
			};
		}
		participants.push({ name: participantName, metrics });
		rawSamples.push({ name: participantName, samples: [record] });
	}
	for (const participant of participants) {
		if (!artifactHashes[participant.name] || !responseHashes[participant.name])
			throw new Error(`${name} ${participant.name} omitted artifact or response identity`);
	}
	return Object.freeze({
		table: Object.freeze({ suite: name, participants: Object.freeze(participants) }),
		populations: Object.freeze([
			Object.freeze({
				name: 'deterministic observation',
				metrics: Object.freeze(metricNames),
				sampleCount: 1,
				warmupCount: 0,
				rawSamples: Object.freeze(rawSamples)
			})
		]),
		artifactHashes: Object.freeze({ ...artifactHashes }),
		responseHashes: Object.freeze({ ...responseHashes })
	});
}

/** Validates the shared correctness and publication envelope on a comparison result. */
export function validateRaw(raw, kind) {
	if (!raw || raw.kind !== kind || raw.correctness?.status !== 'passed')
		throw new Error(`expected a correctness-gated ${kind} result`);
	if (typeof raw.publishable !== 'boolean')
		throw new Error(`${kind} omitted its comparison-publication status`);
}

/** Retains the comparison suite's publication decision without making it an ABI evidence gate. */
export function withSourcePublication(suite, raw) {
	if (!Array.isArray(raw.limitations) || raw.limitations.some((entry) => !entry))
		throw new Error(`${raw.kind} omitted its measurement limitations`);
	return Object.freeze({
		...suite,
		sourceLimitations: Object.freeze([...raw.limitations]),
		sourcePublication: Object.freeze({
			status: raw.publishable ? 'publishable' : 'non-publishable',
			reason: raw.publishable
				? 'framework-comparison publication gate passed'
				: 'source measurement was explicitly marked non-publishable'
		})
	});
}

/** Sums one projected numeric field across a raw collection. */
export function sum(values, read) {
	return values.reduce((total, value) => total + read(value), 0);
}

function readSample(suite, participant, sample, metrics) {
	const result = {};
	for (const [name, read] of Object.entries(metrics)) {
		const value = read(sample);
		if (!Number.isFinite(value))
			throw new Error(`${suite} ${participant} has an incomplete raw ${name} sample`);
		result[name] = value;
	}
	return Object.freeze(result);
}

function unitFor(name) {
	if (name.endsWith('Ms')) return 'ms';
	if (name.endsWith('Bytes')) return 'bytes';
	if (
		name.endsWith('Count') ||
		name.endsWith('Lines') ||
		name.endsWith('Files') ||
		name.endsWith('Sites') ||
		name === 'sourceFiles' ||
		name === 'traceMarkerCoverage'
	)
		return 'count';
	throw new Error(`measurement adapter has no unit for ${name}`);
}
