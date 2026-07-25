import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Limits retained projection state per worker while preserving parallel project coverage. */
export const defaultExpressionCorpusBatchSize = 16;

/** Heap guardrail for the single TypeScript projection worker, in megabytes. */
export const defaultExpressionCorpusWorkerHeapMb = 1_024;

/** Selects projects that own expression projection or provide representative eXact TSX input. */
export function isExpressionCorpusProject(manifest, jsxImportSource) {
	return (
		manifest?.name === '@exactjs/expressions' ||
		['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].some(
			(section) => manifest?.[section]?.['@exactjs/expressions'] !== undefined
		) ||
		jsxImportSource === '@exactjs/jsx'
	);
}

/** Omits tests, declarations, and Vitest-named test integration entry points from routine coverage. */
export function isExpressionCorpusSource(filename) {
	const basename = path.basename(filename);
	return (
		/\.[cm]?[jt]sx?$/.test(basename) &&
		!/\.d\.[cm]?[jt]s$/.test(basename) &&
		!/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(basename) &&
		!/^vitest(?:\..+)?\.[cm]?[jt]s$/.test(basename)
	);
}

/** Resolves a positive integer override or returns the supplied default. */
export function positiveInteger(value, fallback, label) {
	if (value === undefined || value === '') return fallback;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0)
		throw new Error(`${label} must be a positive integer, received ${JSON.stringify(value)}`);
	return parsed;
}

/** Divides project file groups into bounded worker batches without changing file order. */
export function batchExpressionCorpusGroups(groups, batchSize) {
	const batches = [];
	for (const [config, filenames] of groups) {
		for (let start = 0; start < filenames.length; start += batchSize)
			batches.push([config, filenames.slice(start, start + batchSize)]);
	}
	return batches;
}

/** Builds the stable summary persisted for one corpus run. */
export function expressionCorpusRunRecord({
	status,
	elapsedMs,
	workers,
	workerHeapMb,
	batchSize,
	profileDetail,
	fileCount,
	projectCount,
	batchCount,
	peakWorkerRssMb,
	baseline,
	error
}) {
	const expectedMs =
		baseline?.workers === workers &&
		baseline?.workerHeapMb === workerHeapMb &&
		baseline?.batchSize === batchSize &&
		baseline?.profileDetail === profileDetail &&
		baseline?.fileCount === fileCount &&
		baseline?.projectCount === projectCount
			? baseline.elapsedMs
			: undefined;
	return {
		schemaVersion: 1,
		generatedAt: new Date().toISOString(),
		status,
		elapsedMs,
		workers,
		workerHeapMb,
		batchSize,
		profileDetail,
		fileCount,
		projectCount,
		batchCount,
		peakWorkerRssMb,
		node: process.version,
		platform: process.platform,
		arch: process.arch,
		cpu: os.cpus()[0]?.model,
		...(expectedMs === undefined
			? {}
			: {
					baselineElapsedMs: expectedMs,
					baselineDeltaMs: elapsedMs - expectedMs,
					baselineRatio: elapsedMs / expectedMs
				}),
		...(error ? { error } : {})
	};
}

/** Reads the tracked comparison baseline when one has been recorded. */
export async function readExpressionCorpusBaseline(root) {
	try {
		return JSON.parse(
			await readFile(path.join(root, 'docs/performance-baselines/expression-corpus.json'), 'utf8')
		);
	} catch (error) {
		if (error?.code === 'ENOENT') return undefined;
		throw error;
	}
}

/** Appends a run to the ignored local history, retaining the latest fifty measurements. */
export async function appendExpressionCorpusHistory(root, record) {
	const directory = path.join(root, '.tmp');
	const filename = path.join(directory, 'expression-corpus-history.json');
	await mkdir(directory, { recursive: true });
	let history = [];
	try {
		const current = JSON.parse(await readFile(filename, 'utf8'));
		if (Array.isArray(current.runs)) history = current.runs;
	} catch (error) {
		if (error?.code !== 'ENOENT') throw error;
	}
	history.push(record);
	await writeFile(
		filename,
		`${JSON.stringify({ schemaVersion: 1, runs: history.slice(-50) }, null, 2)}\n`
	);
}

/** Replaces the tracked comparison baseline with a successful measured run. */
export async function writeExpressionCorpusBaseline(root, record) {
	if (record.status !== 'passed')
		throw new Error('Cannot update the expression corpus baseline from a failed run');
	const directory = path.join(root, 'docs/performance-baselines');
	await mkdir(directory, { recursive: true });
	await writeFile(
		path.join(directory, 'expression-corpus.json'),
		`${JSON.stringify(
			{
				schemaVersion: 1,
				recordedAt: record.generatedAt,
				elapsedMs: record.elapsedMs,
				workers: record.workers,
				workerHeapMb: record.workerHeapMb,
				batchSize: record.batchSize,
				profileDetail: record.profileDetail,
				peakWorkerRssMb: record.peakWorkerRssMb,
				fileCount: record.fileCount,
				projectCount: record.projectCount,
				node: record.node,
				platform: record.platform,
				arch: record.arch,
				cpu: record.cpu
			},
			null,
			2
		)}\n`
	);
}

/** Formats the baseline comparison used in local and CI timing summaries. */
export function expressionCorpusTrend(record) {
	if (record.baselineRatio === undefined) return 'no comparable baseline';
	const percent = (record.baselineRatio - 1) * 100;
	const direction = percent >= 0 ? 'slower' : 'faster';
	return `${Math.abs(percent).toFixed(1)}% ${direction} than baseline`;
}
