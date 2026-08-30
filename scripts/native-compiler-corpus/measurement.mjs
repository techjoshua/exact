import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Selects explicit native fixtures and representative eXact TSX projects. */
export function isNativeCompilerCorpusProject(manifest, jsxImportSource) {
	return manifest?.name === '@exactjs/native-compiler-corpus' || jsxImportSource === '@exactjs/jsx';
}

/** Omits tests, declarations, and Vitest-named integration entry points. */
export function isNativeCompilerCorpusSource(filename) {
	const basename = path.basename(filename);
	return (
		/\.[cm]?[jt]sx?$/.test(basename) &&
		!/\.d\.[cm]?[jt]s$/.test(basename) &&
		!/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(basename) &&
		!/^vitest(?:\..+)?\.[cm]?[jt]s$/.test(basename)
	);
}

/** Resolves a positive integer override or returns the supplied fallback. */
export function positiveInteger(value, fallback, label) {
	if (value === undefined || value === '') return fallback;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0)
		throw new Error(`${label} must be a positive integer, received ${JSON.stringify(value)}`);
	return parsed;
}

/**
 * Predicts tracked wall time for the current corpus by scaling linearly with source count and
 * inversely with worker count. Incomplete or non-positive measurements are not comparable.
 */
export function normalizedNativeBaselineElapsedMs(baseline, current) {
	const measurements = [
		baseline?.elapsedMs,
		baseline?.fileCount,
		baseline?.workers,
		current?.fileCount,
		current?.workers
	];
	if (!measurements.every((value) => Number.isFinite(value) && value > 0)) return undefined;
	return (
		baseline.elapsedMs *
		(current.fileCount / baseline.fileCount) *
		(baseline.workers / current.workers)
	);
}

/**
 * Compares stable projects by worker time when a project-aware baseline is available.
 * Added or removed projects do not masquerade as compiler regressions.
 */
export function nativeBaselineComparison(baseline, current) {
	if (baseline?.schemaVersion >= 3 && Array.isArray(baseline.projects)) {
		const tracked = new Map(
			baseline.projects.map((project) => [`${project.config}\0${project.fileCount}`, project])
		);
		const matched = (current.projects ?? []).flatMap((project) => {
			const previous = tracked.get(`${project.config}\0${project.fileCount}`);
			return previous ? [{ current: project, baseline: previous }] : [];
		});
		const baselineMs = matched.reduce((total, entry) => total + entry.baseline.elapsedMs, 0);
		const currentMs = matched.reduce((total, entry) => total + entry.current.elapsedMs, 0);
		if (matched.length === 0 || baselineMs <= 0 || currentMs <= 0) return undefined;
		return {
			ratio: currentMs / baselineMs,
			basis: 'matched-project-worker-time',
			matchedProjects: matched.length,
			baselineMs,
			currentMs,
			projectRatios: matched
				.map((entry) => ({
					config: entry.current.config,
					ratio: entry.current.elapsedMs / entry.baseline.elapsedMs,
					baselineMs: entry.baseline.elapsedMs,
					currentMs: entry.current.elapsedMs,
					...(Number.isFinite(entry.baseline.incrementalElapsedMs) &&
					Number.isFinite(entry.current.incrementalElapsedMs) &&
					entry.baseline.incrementalElapsedMs > 0
						? {
								incrementalRatio:
									entry.current.incrementalElapsedMs / entry.baseline.incrementalElapsedMs,
								baselineIncrementalMs: entry.baseline.incrementalElapsedMs,
								currentIncrementalMs: entry.current.incrementalElapsedMs
							}
						: {})
				}))
				.sort((left, right) => right.ratio - left.ratio)
		};
	}
	const normalizedMs = normalizedNativeBaselineElapsedMs(baseline, current);
	if (!normalizedMs) return undefined;
	return {
		ratio: current.elapsedMs / normalizedMs,
		basis: 'legacy-file-count',
		matchedProjects: 0,
		baselineMs: normalizedMs,
		currentMs: current.elapsedMs,
		projectRatios: []
	};
}

/** Returns the middle elapsed-time observation without averaging warm and noisy runs. */
export function medianNativeCorpusResult(results) {
	if (results.length === 0) throw new Error('native corpus measurement requires a sample');
	return [...results].sort((left, right) => left.elapsedMs - right.elapsedMs)[
		Math.floor(results.length / 2)
	];
}

/** Returns per-project median timings so one noisy project cannot dominate an otherwise stable run. */
export function medianNativeProjectElapsedMs(results) {
	if (results.length === 0) throw new Error('native corpus measurement requires a sample');
	const elapsedByConfig = new Map();
	for (const result of results) {
		for (const project of result.projects ?? []) {
			const elapsed = elapsedByConfig.get(project.config) ?? [];
			elapsed.push(project.elapsedMs);
			elapsedByConfig.set(project.config, elapsed);
		}
	}
	return new Map(
		[...elapsedByConfig].map(([config, elapsed]) => [
			config,
			[...elapsed].sort((left, right) => left - right)[Math.floor(elapsed.length / 2)]
		])
	);
}

/** Reads the tracked native compiler throughput baseline. */
export async function readNativeCompilerCorpusBaseline(root) {
	try {
		return JSON.parse(
			await readFile(
				path.join(root, 'docs/performance-baselines/native-compiler-corpus.json'),
				'utf8'
			)
		);
	} catch (error) {
		if (error?.code === 'ENOENT') return undefined;
		throw error;
	}
}

/** Replaces the tracked native compiler throughput baseline. */
export async function writeNativeCompilerCorpusBaseline(root, record) {
	const directory = path.join(root, 'docs/performance-baselines');
	await mkdir(directory, { recursive: true });
	await writeFile(
		path.join(directory, 'native-compiler-corpus.json'),
		`${JSON.stringify(
			{
				schemaVersion: 3,
				recordedAt: record.generatedAt,
				elapsedMs: record.elapsedMs,
				workers: record.workers,
				fileCount: record.fileCount,
				projectCount: record.projectCount,
				outputBytes: record.outputBytes,
				phaseMicroseconds: record.phaseMicroseconds,
				counters: record.counters,
				structure: record.structure,
				projects: record.projects.map((project) => ({
					config: project.config,
					fileCount: project.fileCount,
					elapsedMs: project.elapsedMs,
					phaseMicroseconds: project.phaseMicroseconds,
					counters: project.counters,
					structure: project.structure,
					incrementalElapsedMs: project.incrementalElapsedMs,
					incrementalPhaseMicroseconds: project.incrementalPhaseMicroseconds,
					incrementalCounters: project.incrementalCounters
				})),
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
