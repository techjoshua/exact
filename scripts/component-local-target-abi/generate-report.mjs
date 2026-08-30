import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createComponentLocalTargetAbiCheckpoint } from './checkpoint.mjs';
import { compareComponentLocalTargetAbiCheckpoints } from './comparison.mjs';
import { renderComponentLocalTargetAbiCheckpointReport } from './report.mjs';
import {
	adaptFrameworkComparisonBrowserRun,
	adaptFrameworkComparisonSsr,
	adaptFrameworkComparisonStartupCpu
} from './framework-comparison-adapters.mjs';
import { readComponentLocalTargetAbiPerformanceOutput } from './performance-output.mjs';
import { adaptComponentLocalTargetAbiInternalPerformance } from './internal-performance-adapters.mjs';

/** Validates candidate evidence and derives every requested historical comparison. */
export async function generateComponentLocalTargetAbiReport(config, readJson = readJsonFile) {
	if (!config || typeof config !== 'object' || Array.isArray(config))
		throw new Error('component-local target ABI report config must be an object');
	let candidate = await readJson(requiredString(config.checkpoint, 'checkpoint path'));
	const generatedSuites = [...(candidate.suites ?? [])];
	if (config.internalPerformance) {
		assertImmutableEvidencePath(config.internalPerformance, 'internal performance result path');
		const captured = await readJson(
			requiredString(config.internalPerformance, 'internal performance result path')
		);
		generatedSuites.push(
			...adaptComponentLocalTargetAbiInternalPerformance(
				readComponentLocalTargetAbiPerformanceOutput(captured)
			)
		);
	}
	if (config.frameworkComparison) {
		assertImmutableEvidencePath(
			config.frameworkComparison.browser,
			'framework browser result path'
		);
		assertImmutableEvidencePath(
			config.frameworkComparison.startupCpu,
			'framework startup CPU result path'
		);
		assertImmutableEvidencePath(config.frameworkComparison.ssr, 'framework SSR result path');
		const browser = await readJson(
			requiredString(config.frameworkComparison.browser, 'framework browser result path')
		);
		const startup = await readJson(
			requiredString(config.frameworkComparison.startupCpu, 'framework startup CPU result path')
		);
		const ssr = await readJson(
			requiredString(config.frameworkComparison.ssr, 'framework SSR result path')
		);
		candidate = {
			...candidate,
			suites: [
				...generatedSuites,
				...adaptFrameworkComparisonBrowserRun(browser),
				...adaptFrameworkComparisonStartupCpu(startup),
				...adaptFrameworkComparisonSsr(ssr)
			]
		};
	} else candidate = { ...candidate, suites: generatedSuites };
	const checkpoint = createComponentLocalTargetAbiCheckpoint(candidate, {
		expectedSuites: requiredStrings(config.expectedSuites, 'expected suites')
	});
	if (checkpoint.eligibleForSeries !== true)
		throw new Error('diagnostic and invalid checkpoints cannot generate a published report');
	const comparisons = [];
	for (const baselineConfig of config.baselines ?? []) {
		const baselineCandidate = await readJson(
			requiredString(baselineConfig.path, 'baseline checkpoint path')
		);
		const baseline = createComponentLocalTargetAbiCheckpoint(baselineCandidate, {
			expectedSuites: config.expectedSuites
		});
		comparisons.push(
			...compareComponentLocalTargetAbiCheckpoints({
				baseline,
				current: checkpoint,
				baselineLabel: requiredString(baselineConfig.label, 'baseline label'),
				controlsBySuite: config.controlsBySuite,
				deterministicMetricsBySuite: config.deterministicMetricsBySuite,
				maxControlRatio: config.maxControlRatio
			})
		);
	}
	return Object.freeze({
		checkpoint,
		comparisons: Object.freeze(comparisons),
		markdown: renderComponentLocalTargetAbiCheckpointReport(checkpoint, comparisons)
	});
}

async function main() {
	const configPath = process.argv[2];
	if (!configPath) throw new Error('usage: generate-report.mjs <config.json>');
	const config = await readJsonFile(configPath);
	const generated = await generateComponentLocalTargetAbiReport(config);
	await writeFile(
		resolve(requiredString(config.outputJson, 'output JSON path')),
		`${JSON.stringify({ ...generated.checkpoint, comparisons: generated.comparisons }, null, 2)}\n`
	);
	await writeFile(
		resolve(requiredString(config.outputMarkdown, 'output Markdown path')),
		generated.markdown
	);
}

async function readJsonFile(filename) {
	return JSON.parse(await readFile(resolve(filename), 'utf8'));
}

function requiredString(value, label) {
	if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is required`);
	return value;
}

function requiredStrings(value, label) {
	if (!Array.isArray(value) || value.length === 0 || value.some((entry) => !entry))
		throw new Error(`${label} must be a non-empty string array`);
	return value;
}

/** Prevents accepted checkpoints from depending on well-known mutable capture targets. */
function assertImmutableEvidencePath(value, label) {
	const path = requiredString(value, label).replaceAll('\\', '/');
	const mutableTargets = [
		'/release-performance-output.json',
		'/framework-comparison/latest.json',
		'/framework-comparison/startup-cpu-latest.json'
	];
	if (mutableTargets.some((target) => path.endsWith(target)))
		throw new Error(`${label} must name an immutable phase-specific capture, received ${path}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
