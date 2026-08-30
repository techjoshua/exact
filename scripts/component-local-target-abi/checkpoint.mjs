import os from 'node:os';

import {
	assertComponentLocalTargetAbiStructuralGate,
	componentLocalTargetAbiFallbackFields
} from './structural-report.mjs';
import { validateComponentLocalTargetAbiMeasurementTable } from './comparison.mjs';

const states = Object.freeze(['accepted', 'diagnostic', 'invalid']);
const phaseZeroFields = Object.freeze({
	0: [],
	1: [],
	2: [],
	3: ['declinedNativeJsxRegions', 'genericNativeBindingGroups'],
	4: ['declinedNativeJsxRegions', 'genericNativeBindingGroups'],
	5: ['declinedNativeJsxRegions', 'genericNativeBindingGroups', 'genericNativeSsrImports'],
	6: ['declinedNativeJsxRegions', 'genericNativeBindingGroups', 'genericNativeSsrImports'],
	7: [
		'declinedNativeJsxRegions',
		'genericNativeBindingGroups',
		'genericNativeSsrImports',
		'runtimeCreatedNativeArtifacts'
	],
	8: componentLocalTargetAbiFallbackFields,
	9: componentLocalTargetAbiFallbackFields
});

/** Captures stable host facts while requiring caller-owned browser, Bun, and power identities. */
export function captureComponentLocalTargetAbiEnvironment({
	lineage,
	bun,
	chromium,
	powerMode,
	variables = {}
}) {
	return validateEnvironment({
		lineage,
		node: process.version,
		bun,
		chromium,
		operatingSystem: `${os.type()} ${os.release()}`,
		cpu: os.cpus()[0]?.model,
		memoryBytes: os.totalmem(),
		powerMode,
		variables
	});
}

/** Validates and canonicalizes one proposal checkpoint without admitting partial evidence. */
export function createComponentLocalTargetAbiCheckpoint(candidate, { expectedSuites = [] } = {}) {
	if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
		throw new Error('component-local target ABI checkpoint must be an object');
	if (!Number.isSafeInteger(candidate.phase) || candidate.phase < 0 || candidate.phase > 9)
		throw new Error('checkpoint phase must be an integer from 0 through 9');
	if (!states.includes(candidate.status)) throw new Error('checkpoint has an unsupported state');
	const base = {
		schemaVersion: 1,
		checkpoint: `P${candidate.phase}`,
		phase: candidate.phase,
		status: candidate.status,
		recordedAt: requiredString(candidate.recordedAt, 'checkpoint recordedAt'),
		identity: validateIdentity(candidate.identity),
		environment: validateEnvironment(candidate.environment),
		impact: validateImpact(candidate.impact, candidate.phase),
		limitations: validateStrings(candidate.limitations ?? [], 'checkpoint limitations')
	};
	if (candidate.status === 'invalid') {
		return Object.freeze({
			...base,
			eligibleForSeries: false,
			reasons: validateNonemptyStrings(candidate.reasons, 'invalid checkpoint reasons')
		});
	}
	if (candidate.status === 'diagnostic') {
		return Object.freeze({
			...base,
			eligibleForSeries: false,
			diagnostic: validateDiagnostic(candidate.diagnostic)
		});
	}
	const correctness = validateCorrectness(candidate.correctness);
	const structuralReport = assertComponentLocalTargetAbiStructuralGate(
		candidate.structuralReport,
		phaseZeroFields[candidate.phase]
	);
	return Object.freeze({
		...base,
		eligibleForSeries: true,
		correctness,
		structuralGate: Object.freeze({
			status: 'passed',
			zeroFields: phaseZeroFields[candidate.phase]
		}),
		structuralReport,
		suites: validateSuites(candidate.suites, expectedSuites),
		...(candidate.analysis === undefined ? {} : { analysis: validateAnalysis(candidate.analysis) })
	});
}

function validateAnalysis(analysis) {
	if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis))
		throw new Error('checkpoint analysis must be an object');
	return Object.freeze({
		improvements: validateStrings(analysis.improvements ?? [], 'checkpoint improvements'),
		regressions: validateStrings(analysis.regressions ?? [], 'checkpoint regressions'),
		unexpected: validateStrings(analysis.unexpected ?? [], 'checkpoint unexpected changes'),
		disposition: validateNonemptyStrings(analysis.disposition, 'checkpoint analysis disposition')
	});
}

function validateIdentity(identity) {
	if (!identity || typeof identity !== 'object') throw new Error('checkpoint omitted identity');
	return Object.freeze({
		revision: requiredString(identity.revision, 'repository revision'),
		worktreePatchHash: requiredString(identity.worktreePatchHash, 'worktree patch hash'),
		lockfileHash: requiredString(identity.lockfileHash, 'lockfile hash'),
		harnessHash: requiredString(identity.harnessHash, 'benchmark harness hash'),
		productionBuildHashes: validateStringMap(
			identity.productionBuildHashes,
			'production build hashes',
			true
		)
	});
}

function validateEnvironment(environment) {
	if (!environment || typeof environment !== 'object')
		throw new Error('checkpoint omitted environment');
	if (!Number.isSafeInteger(environment.memoryBytes) || environment.memoryBytes <= 0)
		throw new Error('checkpoint environment requires positive memoryBytes');
	return Object.freeze({
		lineage: requiredString(environment.lineage, 'environment lineage'),
		node: requiredString(environment.node, 'Node identity'),
		bun: requiredString(environment.bun, 'Bun identity'),
		chromium: requiredString(environment.chromium, 'Chromium identity'),
		operatingSystem: requiredString(environment.operatingSystem, 'operating system identity'),
		cpu: requiredString(environment.cpu, 'CPU identity'),
		memoryBytes: environment.memoryBytes,
		powerMode: requiredString(environment.powerMode, 'power mode'),
		variables: validateStringMap(environment.variables ?? {}, 'environment variables')
	});
}

function validateImpact(impact, phase) {
	if (!impact || typeof impact !== 'object') throw new Error('checkpoint omitted phase impact');
	if (impact.phase !== phase) throw new Error('phase impact does not match checkpoint phase');
	if (!impact.materiality || typeof impact.materiality !== 'object')
		throw new Error('phase impact omitted materiality rules');
	for (const field of ['timingNoiseRatio', 'sizeBytes', 'memoryBytes']) {
		if (!(Number.isFinite(impact.materiality[field]) && impact.materiality[field] >= 0))
			throw new Error(`phase impact requires non-negative materiality ${field}`);
	}
	if (!Array.isArray(impact.areas) || impact.areas.length === 0)
		throw new Error('phase impact requires affected or stable areas');
	return Object.freeze({
		phase,
		recordedAt: requiredString(impact.recordedAt, 'phase impact recordedAt'),
		mechanisms: validateNonemptyStrings(impact.mechanisms, 'phase impact mechanisms'),
		materiality: Object.freeze({ ...impact.materiality }),
		areas: Object.freeze(
			impact.areas.map((area, index) => {
				if (!['improve', 'temporary-regression', 'stable'].includes(area?.classification))
					throw new Error(`phase impact area ${index + 1} has invalid classification`);
				if (
					area.classification === 'temporary-regression' &&
					!Number.isSafeInteger(area.removalPhase)
				)
					throw new Error(`temporary regression ${area.name ?? index + 1} requires removalPhase`);
				return Object.freeze({
					name: requiredString(area.name, `phase impact area ${index + 1} name`),
					classification: area.classification,
					metrics: validateNonemptyStrings(area.metrics, `${area.name} metrics`),
					structuralEvidence: validateNonemptyStrings(
						area.structuralEvidence,
						`${area.name} structural evidence`
					),
					counterMetrics: validateNonemptyStrings(
						area.counterMetrics,
						`${area.name} counter metrics`
					),
					...(area.removalPhase === undefined ? {} : { removalPhase: area.removalPhase })
				});
			})
		)
	});
}

function validateCorrectness(correctness) {
	if (!Array.isArray(correctness) || correctness.length === 0)
		throw new Error('accepted checkpoint requires correctness commands');
	return Object.freeze(
		correctness.map((entry, index) => {
			const command = requiredString(entry?.command, `correctness command ${index + 1}`);
			if (entry.status !== 'passed')
				throw new Error(`correctness command did not pass: ${command}`);
			return Object.freeze({ command, status: 'passed' });
		})
	);
}

function validateSuites(suites, expectedSuites) {
	if (!Array.isArray(suites) || suites.length === 0)
		throw new Error('accepted checkpoint requires measurement suites');
	const names = suites.map((suite) => suite?.table?.suite);
	if (new Set(names).size !== names.length)
		throw new Error('checkpoint repeats a measurement suite');
	const missing = expectedSuites.filter((name) => !names.includes(name));
	const unexpected = names.filter(
		(name) => expectedSuites.length > 0 && !expectedSuites.includes(name)
	);
	if (missing.length || unexpected.length)
		throw new Error(
			`checkpoint suite inventory mismatch: missing ${missing.join(', ') || 'none'}; unexpected ${unexpected.join(', ') || 'none'}`
		);
	return Object.freeze(suites.map(validateSuite));
}

function validateSuite(suite) {
	const table = validateComponentLocalTargetAbiMeasurementTable(suite?.table);
	const populations = validatePopulations(suite.populations, table);
	return Object.freeze({
		table,
		populations,
		artifactHashes: validateStringMap(suite.artifactHashes, `${table.suite} artifact hashes`, true),
		...(suite.sourceLimitations === undefined
			? {}
			: {
					sourceLimitations: validateNonemptyStrings(
						suite.sourceLimitations,
						`${table.suite} source limitations`
					)
				}),
		...(suite.sourcePublication === undefined
			? {}
			: { sourcePublication: validateSourcePublication(suite.sourcePublication, table.suite) }),
		...validateResponseIdentity(suite, table.suite)
	});
}

function validateSourcePublication(publication, suiteName) {
	if (!publication || !['publishable', 'non-publishable'].includes(publication.status))
		throw new Error(`${suiteName} has an invalid source publication status`);
	return Object.freeze({
		status: publication.status,
		reason: requiredString(publication.reason, `${suiteName} source publication reason`)
	});
}

function validateResponseIdentity(suite, suiteName) {
	if (suite.responseIdentity?.status === 'inapplicable') {
		return Object.freeze({
			responseHashes: validateStringMap(suite.responseHashes ?? {}, `${suiteName} response hashes`),
			responseIdentity: Object.freeze({
				status: 'inapplicable',
				reason: requiredString(
					suite.responseIdentity.reason,
					`${suiteName} response identity reason`
				)
			})
		});
	}
	if (suite.responseIdentity !== undefined)
		throw new Error(`${suiteName} has an unsupported response identity status`);
	return Object.freeze({
		responseHashes: validateStringMap(suite.responseHashes, `${suiteName} response hashes`, true)
	});
}

function validatePopulations(populations, table) {
	if (!Array.isArray(populations) || populations.length === 0)
		throw new Error(`${table.suite} requires raw metric populations`);
	const covered = new Set();
	const participantNames = table.participants.map((participant) => participant.name).sort();
	const result = populations.map((population, index) => {
		const name = requiredString(population?.name, `${table.suite} population ${index + 1} name`);
		const metrics = validateNonemptyStrings(population.metrics, `${table.suite} ${name} metrics`);
		for (const metric of metrics) {
			if (!table.metrics.includes(metric))
				throw new Error(`${table.suite} ${name} contains unknown metric ${metric}`);
			if (covered.has(metric)) throw new Error(`${table.suite} repeats raw metric ${metric}`);
			covered.add(metric);
		}
		if (population.kind === 'reported')
			return validateReportedPopulation(population, table, name, metrics, participantNames);
		if (population.kind !== undefined && population.kind !== 'samples')
			throw new Error(`${table.suite} ${name} has an unsupported population kind`);
		if (!Number.isSafeInteger(population.sampleCount) || population.sampleCount <= 0)
			throw new Error(`${table.suite} ${name} requires a positive sampleCount`);
		if (!Number.isSafeInteger(population.warmupCount) || population.warmupCount < 0)
			throw new Error(`${table.suite} ${name} requires a non-negative warmupCount`);
		if (!Array.isArray(population.rawSamples))
			throw new Error(`${table.suite} ${name} omitted raw samples`);
		const rawNames = population.rawSamples.map((entry) => entry?.name).sort();
		if (JSON.stringify(rawNames) !== JSON.stringify(participantNames))
			throw new Error(`${table.suite} ${name} raw samples do not match its participants`);
		for (const entry of population.rawSamples) {
			if (!Array.isArray(entry.samples) || entry.samples.length !== population.sampleCount)
				throw new Error(`${table.suite} ${entry.name} has an invalid ${name} sample population`);
			for (const sample of entry.samples) {
				for (const metric of metrics) {
					if (!Number.isFinite(sample?.[metric]))
						throw new Error(`${table.suite} ${entry.name} has an incomplete raw ${metric} sample`);
				}
			}
		}
		return Object.freeze({
			name,
			kind: 'samples',
			metrics,
			sampleCount: population.sampleCount,
			warmupCount: population.warmupCount,
			rawSamples: Object.freeze(population.rawSamples)
		});
	});
	const missing = table.metrics.filter((metric) => !covered.has(metric));
	if (missing.length) throw new Error(`${table.suite} omitted raw metrics: ${missing.join(', ')}`);
	return Object.freeze(result);
}

function validateReportedPopulation(population, table, name, metrics, participantNames) {
	if (!Array.isArray(population.rawSummaries))
		throw new Error(`${table.suite} ${name} omitted reported summaries`);
	const rawNames = population.rawSummaries.map((entry) => entry?.name).sort();
	if (JSON.stringify(rawNames) !== JSON.stringify(participantNames))
		throw new Error(`${table.suite} ${name} summaries do not match its participants`);
	const tableByName = new Map(
		table.participants.map((participant) => [participant.name, participant])
	);
	for (const entry of population.rawSummaries) {
		if (!Number.isSafeInteger(entry.observationCount) || entry.observationCount <= 0)
			throw new Error(`${table.suite} ${entry.name} requires a positive ${name} observationCount`);
		for (const metric of metrics) {
			const reported = entry.metrics?.[metric];
			const expected = tableByName.get(entry.name).metrics[metric];
			for (const percentile of ['p50', 'p75', 'p95', 'p99']) {
				if (!Number.isFinite(reported?.[percentile]))
					throw new Error(`${table.suite} ${entry.name} omitted reported ${metric}.${percentile}`);
				if (reported[percentile] !== expected[percentile])
					throw new Error(`${table.suite} ${entry.name} reported ${metric}.${percentile} drifted`);
			}
		}
	}
	return Object.freeze({
		name,
		kind: 'reported',
		metrics,
		rawSummaries: Object.freeze(population.rawSummaries)
	});
}

function validateDiagnostic(diagnostic) {
	if (!diagnostic || typeof diagnostic !== 'object')
		throw new Error('diagnostic checkpoint requires its experiment contract');
	return Object.freeze({
		question: requiredString(diagnostic.question, 'diagnostic question'),
		hypothesis: requiredString(diagnostic.hypothesis, 'diagnostic hypothesis'),
		alternatives: validateNonemptyStrings(diagnostic.alternatives, 'diagnostic alternatives'),
		correctnessAssertion: requiredString(
			diagnostic.correctnessAssertion,
			'diagnostic correctness assertion'
		),
		decisionThreshold: requiredString(diagnostic.decisionThreshold, 'diagnostic decision threshold')
	});
}

function requiredString(value, label) {
	if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is required`);
	return value;
}

function validateStrings(values, label) {
	if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || !value))
		throw new Error(`${label} must be an array of non-empty strings`);
	return Object.freeze([...values]);
}

function validateNonemptyStrings(values, label) {
	const result = validateStrings(values, label);
	if (result.length === 0) throw new Error(`${label} must not be empty`);
	return result;
}

function validateStringMap(value, label, nonempty = false) {
	if (!value || typeof value !== 'object' || Array.isArray(value))
		throw new Error(`${label} must be an object`);
	const entries = Object.entries(value);
	if (nonempty && entries.length === 0) throw new Error(`${label} must not be empty`);
	if (entries.some(([key, entry]) => !key || typeof entry !== 'string' || !entry))
		throw new Error(`${label} requires non-empty string keys and values`);
	return Object.freeze(Object.fromEntries(entries));
}
