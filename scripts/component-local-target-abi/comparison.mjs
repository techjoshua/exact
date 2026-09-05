const percentiles = Object.freeze(['p50', 'p75', 'p95', 'p99']);
const intrinsicallyDeterministicMetrics = new Set([
	'artifactBrotliBytes',
	'artifactFiles',
	'artifactGzipBytes',
	'artifactRawBytes',
	'authoredProductionLines',
	'authoredTestLines',
	'compiledFunctionBeforeFcpCount',
	'compiledFunctionCount',
	'decodedScriptBytes',
	'domCommentCount',
	'domElementCount',
	'domNodeCount',
	'domTextCount',
	'executedCodeBytes',
	'invokedFunctionCount',
	'manualTransportSites',
	'parsedFunctionBeforeFcpCount',
	'parsedFunctionCount',
	'profiledCodeBytes',
	'profiledFunctionCount',
	'responseBytes',
	'sourceFiles',
	'synchronizationSites',
	'traceMarkerCoverage',
	'transferredScriptBytes'
]);

/**
 * Validates a complete participant table and returns a canonical immutable representation. Every
 * participant must expose the same metrics, units, and common percentile set.
 */
export function validateComponentLocalTargetAbiMeasurementTable(table) {
	if (!table || typeof table !== 'object' || Array.isArray(table))
		throw new Error('component-local target ABI measurement table must be an object');
	if (typeof table.suite !== 'string' || table.suite.length === 0)
		throw new Error('measurement table requires a suite name');
	const mode = table.mode ?? 'controls';
	if (mode !== 'controls' && mode !== 'exact-only')
		throw new Error(`${table.suite} has an unsupported comparison mode`);
	if (!Array.isArray(table.participants) || table.participants.length < 1)
		throw new Error(`${table.suite} requires at least one participant`);
	if (mode === 'controls' && table.participants.length < 2)
		throw new Error(`${table.suite} control comparison requires at least two participants`);
	if (mode === 'exact-only' && table.participants.length !== 1)
		throw new Error(`${table.suite} exact-only comparison requires one participant`);
	const participantNames = new Set();
	const expectedMetrics = Object.keys(table.participants[0]?.metrics ?? {}).sort();
	if (expectedMetrics.length === 0) throw new Error(`${table.suite} requires metrics`);
	const participants = table.participants.map((participant) => {
		if (typeof participant?.name !== 'string' || participant.name.length === 0)
			throw new Error(`${table.suite} contains an unnamed participant`);
		if (participantNames.has(participant.name))
			throw new Error(`${table.suite} repeats participant ${participant.name}`);
		participantNames.add(participant.name);
		const metricNames = Object.keys(participant.metrics ?? {}).sort();
		if (!sameStrings(metricNames, expectedMetrics))
			throw new Error(`${table.suite} participant ${participant.name} has incomplete metrics`);
		const metrics = {};
		for (const metricName of expectedMetrics) {
			const metric = participant.metrics[metricName];
			if (typeof metric?.unit !== 'string' || metric.unit.length === 0)
				throw new Error(`${table.suite} ${participant.name}.${metricName} requires a unit`);
			const values = {};
			if (metric.mean !== undefined) {
				if (typeof metric.mean !== 'number' || !Number.isFinite(metric.mean))
					throw new Error(`${table.suite} ${participant.name}.${metricName} has invalid mean`);
				values.mean = metric.mean;
			}
			for (const percentile of percentiles) {
				const value = metric[percentile];
				if (typeof value !== 'number' || !Number.isFinite(value))
					throw new Error(
						`${table.suite} ${participant.name}.${metricName} omitted finite ${percentile}`
					);
				values[percentile] = value;
			}
			metrics[metricName] = Object.freeze({ unit: metric.unit, ...values });
		}
		return Object.freeze({ name: participant.name, metrics: Object.freeze(metrics) });
	});
	for (const metricName of expectedMetrics) {
		const expectedUnit = participants[0].metrics[metricName].unit;
		for (const participant of participants) {
			if (participant.metrics[metricName].unit !== expectedUnit)
				throw new Error(`${table.suite} changed the unit for ${metricName}`);
		}
	}
	return Object.freeze({
		suite: table.suite,
		mode,
		participants: Object.freeze(participants),
		metrics: Object.freeze(expectedMetrics)
	});
}

/**
 * Normalizes an earlier eXact result to the current environment using unchanged control-framework
 * ratios. Known artifact, DOM, response, code-coverage, and function-inventory metrics always use
 * their raw values; callers may declare additional deterministic metrics. A row is explicitly
 * ineligible when controls are missing, non-positive, or disagree beyond the configured ratio;
 * raw history is never rewritten.
 */
export function compareComponentLocalTargetAbiMeasurements({
	before,
	current,
	exactParticipant = 'exact',
	controls,
	deterministicMetrics = [],
	maxControlRatio = 1.2
}) {
	const previous = validateComponentLocalTargetAbiMeasurementTable(before);
	const next = validateComponentLocalTargetAbiMeasurementTable(current);
	if (previous.suite !== next.suite)
		throw new Error(`cannot compare ${previous.suite} with ${next.suite}`);
	if (previous.mode !== next.mode) throw new Error(`${previous.suite} changed its comparison mode`);
	if (!sameStrings(previous.metrics, next.metrics))
		throw new Error(`${previous.suite} changed its metric inventory`);
	if (previous.mode === 'controls' && (!Array.isArray(controls) || new Set(controls).size < 2))
		throw new Error(
			`${previous.suite} comparison requires at least two distinct control participants`
		);
	if (!(typeof maxControlRatio === 'number' && maxControlRatio >= 1))
		throw new Error('maxControlRatio must be at least 1');
	const previousByName = new Map(previous.participants.map((value) => [value.name, value]));
	const nextByName = new Map(next.participants.map((value) => [value.name, value]));
	const previousExact = previousByName.get(exactParticipant);
	const nextExact = nextByName.get(exactParticipant);
	if (!previousExact || !nextExact)
		throw new Error(`${previous.suite} omitted exact participant ${exactParticipant}`);
	const deterministic = new Set([...intrinsicallyDeterministicMetrics, ...deterministicMetrics]);
	const rows = [];
	for (const metric of previous.metrics) {
		for (const percentile of percentiles) {
			const beforeRaw = previousExact.metrics[metric][percentile];
			const currentRaw = nextExact.metrics[metric][percentile];
			let factor;
			let eligibility = 'eligible';
			let dispersion;
			let confidence = 'not-applicable';
			const controlRatios = [];
			if (previous.mode === 'exact-only') {
				eligibility = 'exact-only';
			} else if (deterministic.has(metric)) {
				eligibility = 'deterministic';
			} else {
				const ratios = [];
				for (const control of controls) {
					const beforeControl = previousByName.get(control)?.metrics[metric]?.[percentile];
					const currentControl = nextByName.get(control)?.metrics[metric]?.[percentile];
					if (!(beforeControl > 0) || !(currentControl > 0)) {
						eligibility = `missing-positive-control:${control}`;
						break;
					}
					ratios.push(currentControl / beforeControl);
					controlRatios.push(
						Object.freeze({ participant: control, ratio: currentControl / beforeControl })
					);
				}
				if (eligibility === 'eligible') {
					const minimum = Math.min(...ratios);
					const maximum = Math.max(...ratios);
					dispersion = maximum / minimum;
					if (dispersion > maxControlRatio) eligibility = 'control-dispersion';
					else {
						factor = geometricMean(ratios);
						confidence = dispersion <= 1.05 ? 'high' : dispersion <= 1.1 ? 'medium' : 'low';
					}
				}
			}
			const normalizedBefore = factor === undefined ? beforeRaw : beforeRaw * factor;
			const rawDelta = currentRaw - beforeRaw;
			rows.push(
				Object.freeze({
					metric,
					percentile,
					unit: previousExact.metrics[metric].unit,
					beforeRaw,
					controlFactor: factor,
					controlRatios: Object.freeze(controlRatios),
					dispersion,
					confidence,
					eligibility,
					normalizedBefore,
					current: currentRaw,
					rawDelta,
					rawDeltaRatio: beforeRaw === 0 ? undefined : currentRaw / beforeRaw - 1,
					delta: currentRaw - normalizedBefore,
					deltaRatio: normalizedBefore === 0 ? undefined : currentRaw / normalizedBefore - 1
				})
			);
		}
	}
	return Object.freeze({ suite: previous.suite, rows: Object.freeze(rows) });
}

/**
 * Compares every suite in one accepted checkpoint with an accepted baseline. Suite and metric
 * inventories must match; a missing lane is never silently omitted from the published report.
 */
export function compareComponentLocalTargetAbiCheckpoints({
	baseline,
	current,
	baselineLabel,
	controlsBySuite,
	deterministicMetricsBySuite = {},
	maxControlRatio = 1.2
}) {
	if (baseline?.eligibleForSeries !== true || current?.eligibleForSeries !== true)
		throw new Error('checkpoint comparison requires two accepted checkpoints');
	if (typeof baselineLabel !== 'string' || baselineLabel.length === 0)
		throw new Error('checkpoint comparison requires a baseline label');
	const beforeBySuite = new Map(baseline.suites.map((suite) => [suite.table.suite, suite]));
	const currentNames = current.suites.map((suite) => suite.table.suite);
	const beforeNames = baseline.suites.map((suite) => suite.table.suite);
	if (!sameStrings([...beforeNames].sort(), [...currentNames].sort()))
		throw new Error('checkpoint comparison changed its suite inventory');
	return Object.freeze(
		current.suites.map((suite) => {
			const suiteName = suite.table.suite;
			const exactParticipant = resolveExactParticipant(suite.table);
			const controls = controlsBySuite?.[suiteName];
			if (suite.table.mode !== 'exact-only' && !Array.isArray(controls))
				throw new Error(`${suiteName} checkpoint comparison omitted controls`);
			const comparison = compareComponentLocalTargetAbiMeasurements({
				before: beforeBySuite.get(suiteName).table,
				current: suite.table,
				exactParticipant,
				controls: controls ?? [],
				deterministicMetrics: deterministicMetricsBySuite[suiteName] ?? [],
				maxControlRatio
			});
			return Object.freeze({ baseline: baselineLabel, ...comparison });
		})
	);
}

function resolveExactParticipant(table) {
	const names = new Set(table.participants.map((participant) => participant.name));
	if (names.has('exact')) return 'exact';
	if (names.has('exact-controlled')) return 'exact-controlled';
	throw new Error(`${table.suite} omitted an eXact participant`);
}

function sameStrings(left, right) {
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

function geometricMean(values) {
	return Math.exp(values.reduce((total, value) => total + Math.log(value), 0) / values.length);
}
