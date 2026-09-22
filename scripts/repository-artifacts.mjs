import { execFileSync } from 'node:child_process';

const maximumBlobBytes = 1024 * 1024;
// Census coordinates are application input data, not a benchmark capture or generated build.
const sourceSizeExceptions = new Map([
	['apps/shipping-calculator/src/data/zcta-centroids.json', 1536 * 1024]
]);
const retainedPerformanceFiles = new Set([
	'docs/performance-baselines/benchmark-retention.md',
	'docs/performance-baselines/results.json',
	'docs/performance-baselines/native-compiler-corpus.json',
	'docs/performance-baselines/component-local-target-abi/phase-0-impact.json'
]);

/** Returns a policy violation for a tracked path/size, or undefined for an admitted source or fixture. */
export function artifactViolation(filename, bytes) {
	if (filename.startsWith('docs/performance-baselines/') && !retainedPerformanceFiles.has(filename))
		return 'performance captures and per-run reports belong outside Git';
	if (
		filename.startsWith('framework-comparison/results/') &&
		filename !== 'framework-comparison/results/README.md'
	)
		return 'comparison outputs belong outside Git';
	if (
		/(^|\/)(node_modules|dist|coverage|\.tmp|\.exact|\.svelte-kit|\.nuxt|\.output|test-results)\//.test(
			filename
		) ||
		filename.startsWith('output/') ||
		/^\.exact-performance-[^/]+\//.test(filename)
	)
		return 'temporary, dependency, or generated build output belongs outside Git';
	if (/\.(zip|cpuprofile|heapprofile|heapsnapshot)$/i.test(filename))
		return 'archives and raw profiles belong outside Git; preserve intentional fixtures as source';
	const limit = sourceSizeExceptions.get(filename) ?? maximumBlobBytes;
	if (bytes > limit) return `blob exceeds the ${limit}-byte source limit`;
	return undefined;
}

/** Reads Git output without a shell; failures reject the check rather than skipping unavailable history. */
function git(root, args, input) {
	return execFileSync('git', args, {
		cwd: root,
		encoding: 'utf8',
		input,
		stdio: ['pipe', 'pipe', 'pipe'],
		maxBuffer: 64 * 1024 * 1024
	});
}

/** Parses NUL-delimited index or tree records, retaining file modes and paths including whitespace. */
function readEntries(records, index) {
	return records
		.split('\0')
		.filter(Boolean)
		.map((record) => {
			const separator = record.indexOf('\t');
			const metadata = record.slice(0, separator).split(' ');
			if (index && metadata[2] !== '0')
				throw new Error('Resolve index conflicts before checking artifacts.');
			return {
				filename: record.slice(separator + 1),
				mode: metadata[0],
				oid: metadata[index ? 1 : 2]
			};
		});
}

/**
 * Checks the staged tree and every commit introduced since base, including artifacts later deleted.
 * Uses only Git objects and Node built-ins, so it works before dependencies or package outputs exist.
 * Returns violations; invalid Git input, missing objects, and unresolved index entries throw.
 */
export function checkRepositoryArtifacts(root, { base } = {}) {
	const snapshots = [
		{ label: 'index', entries: readEntries(git(root, ['ls-files', '--stage', '-z']), true) }
	];
	if (base !== undefined) {
		const baseCommit = git(root, [
			'rev-parse',
			'--verify',
			'--end-of-options',
			`${base}^{commit}`
		]).trim();
		const commits = git(root, ['rev-list', '--reverse', `${baseCommit}..HEAD`]).trim();
		for (const commit of commits ? commits.split('\n') : [])
			snapshots.push({
				label: commit,
				entries: readEntries(git(root, ['ls-tree', '-rz', commit]), false)
			});
	}
	const oids = [
		...new Set(
			snapshots.flatMap(({ entries }) =>
				entries.filter((entry) => entry.mode !== '160000').map(({ oid }) => oid)
			)
		)
	];
	const sizes = new Map();
	if (oids.length) {
		const output = git(
			root,
			['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'],
			`${oids.join('\n')}\n`
		);
		for (const line of output.trim().split('\n')) {
			const [oid, type, size] = line.split(' ');
			if (type !== 'blob' || !/^\d+$/.test(size ?? ''))
				throw new Error(`Invalid Git blob metadata: ${line}`);
			sizes.set(oid, Number(size));
		}
	}
	const violations = [];
	const seen = new Set();
	for (const { label, entries } of snapshots) {
		for (const { filename, oid, mode } of entries) {
			const key = `${filename}\0${oid}`;
			if (seen.has(key)) continue;
			seen.add(key);
			const reason = artifactViolation(filename, mode === '160000' ? 0 : sizes.get(oid));
			if (reason) violations.push({ snapshot: label, filename, reason });
		}
	}
	return violations;
}
