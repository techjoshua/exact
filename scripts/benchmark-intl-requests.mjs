import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, release } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const modes = ['reused-same', 'fresh-same', 'reused-mixed', 'fresh-mixed'];
const warmups = 200;
const samples = 31;
const repetitions = 16;

if (process.argv[2] === '--measure') {
	await measure(process.argv[3], process.argv[4], process.argv[5], Number(process.argv[6]));
} else if (process.argv[2] === '--compare') {
	await compare(
		path.resolve(process.argv[3]),
		path.resolve(process.argv[4]),
		path.resolve(process.argv[5] ?? '.tmp/intl-request-comparison')
	);
} else {
	throw new Error(
		'Usage: --compare <before-artifacts> <after-artifacts> [output], or --measure <artifacts> <result.json> <mode> <count>'
	);
}

/** Returns the central value, averaging the middle pair for even populations. */
function median(values) {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Includes fresh environment construction in SSR timing; output assertions run on every request. */
async function measure(directory, filename, mode, count) {
	if (!modes.includes(mode) || ![1, 100].includes(count))
		throw new Error('Unknown Intl request workload');
	const server = await import(pathToFileURL(path.join(directory, 'server.mjs')));
	for (let index = 0; index < warmups; index++) await server.measureIntlRequests(mode, count);
	const values = [];
	for (let index = 0; index < samples; index++) {
		let elapsed = 0;
		for (let repetition = 0; repetition < repetitions; repetition++) {
			const result = await server.measureIntlRequests(mode, count);
			elapsed += result.perRequestMs;
		}
		values.push(elapsed / repetitions);
	}
	await writeFile(
		filename,
		JSON.stringify(
			{ mode, count, warmups, repetitions, samples: values, medianMs: median(values) },
			null,
			2
		)
	);
}

/** Alternates immutable variant bundles in fresh processes without concurrent build or profile work. */
async function compare(before, after, output) {
	await mkdir(output, { recursive: true });
	const artifacts = {};
	for (const [side, directory] of Object.entries({ before, after })) {
		const bytes = await readFile(path.join(directory, 'server.mjs'));
		artifacts[side] = {
			bytes: bytes.length,
			sha256: createHash('sha256').update(bytes).digest('hex')
		};
	}
	const results = {};
	for (let round = 0; round < 4; round++) {
		for (const mode of round % 2 ? [...modes].reverse() : modes) {
			for (const count of [1, 100]) {
				const key = `${mode}-${count}`;
				results[key] ??= { before: [], after: [] };
				for (const side of round % 2 ? ['after', 'before'] : ['before', 'after']) {
					const filename = path.join(output, `${round}-${side}-${key}.json`);
					const worker = spawnSync(
						process.execPath,
						[
							process.argv[1],
							'--measure',
							side === 'before' ? before : after,
							filename,
							mode,
							String(count)
						],
						{ stdio: 'inherit' }
					);
					if (worker.error) throw worker.error;
					if (worker.status !== 0) throw new Error(`Intl request worker failed: ${key}/${side}`);
					results[key][side].push(JSON.parse(await readFile(filename, 'utf8')).medianMs);
				}
			}
		}
		console.log(`Completed Intl request round ${round + 1}/4`);
	}
	const comparisons = Object.fromEntries(
		Object.entries(results).map(([key, values]) => {
			const beforeMs = median(values.before);
			const afterMs = median(values.after);
			return [
				key,
				{
					beforeMs,
					afterMs,
					changePercent: (afterMs / beforeMs - 1) * 100,
					pairedChanges: values.after.map(
						(value, index) => (value / values.before[index] - 1) * 100
					),
					rounds: values
				}
			];
		})
	);
	const report = {
		measuredAt: new Date().toISOString(),
		node: process.version,
		platform: process.platform,
		kernel: release(),
		cpu: cpus()[0]?.model,
		revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
		worktreeStatus: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }),
		warmups,
		samples,
		repetitions,
		artifacts,
		comparisons
	};
	await writeFile(path.join(output, 'comparison.json'), JSON.stringify(report, null, 2));
	console.log(JSON.stringify(comparisons, null, 2));
}
