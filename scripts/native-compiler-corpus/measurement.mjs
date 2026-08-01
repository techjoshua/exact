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
				schemaVersion: 1,
				recordedAt: record.generatedAt,
				elapsedMs: record.elapsedMs,
				workers: record.workers,
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
