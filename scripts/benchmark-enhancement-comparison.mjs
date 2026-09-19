import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { cpus } from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { installPerformanceDom } from './performance/dom-environment.mjs';

const workspace = path.resolve(import.meta.dirname, '..');
const script = path.join(import.meta.dirname, 'benchmark-enhancement-comparison.mjs');
const kinds = ['plain', 'intrinsic', 'component', 'explicit', 'intl'];
const count = 100;
const updates = 10;
const samples = 21;
const warmups = 20;
const serverWarmups = 500;
const measurement = {
	protocol: 2,
	count,
	updates,
	samples,
	warmups,
	serverWarmups,
	browserPhaseIsolation: true
};
const median = (values) => {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

if (process.argv[2] === '--build') {
	await build(process.argv[3], process.argv[4], process.argv[5] === 'before');
} else if (process.argv[2] === '--measure') {
	await measure(process.argv[3], process.argv[4]);
} else if (process.argv[2] === '--measure-server') {
	await measureServer(process.argv[3], process.argv[4]);
} else if (process.argv[2] === '--measure-client' || process.argv[2] === '--measure-hydration') {
	await measureBrowser(
		process.argv[3],
		process.argv[4],
		process.argv[5],
		process.argv[2] === '--measure-hydration'
	);
} else {
	const before = process.argv.find((value) => value.startsWith('--before='))?.slice(9);
	if (!before) throw new Error('Specify --before=<built baseline worktree>');
	const roots = { before: path.resolve(before), after: workspace };
	const summarizeOnly = process.argv.includes('--summarize');
	const output = path.join(workspace, '.tmp', 'enhancement-comparison');
	await mkdir(output, { recursive: true });
	const artifacts = {};
	for (const side of ['before', 'after']) {
		const directory = path.join(output, side);
		if (!summarizeOnly) await run(['--build', roots[side], directory, side], roots[side]);
		artifacts[side] = {};
		for (const target of ['client', 'server']) {
			const bytes = await readFile(path.join(directory, `${target}.mjs`));
			artifacts[side][target] = { raw: bytes.length, gzip: gzipSync(bytes).length };
		}
	}
	const rounds = [];
	// Alternate process order to reduce one-sided warm-cache and thermal drift.
	for (let index = 0; index < 4; index++) {
		const round = {};
		for (const side of index % 2 ? ['after', 'before'] : ['before', 'after']) {
			const filename = path.join(output, `round-${index}-${side}.json`);
			if (!summarizeOnly) await run(['--measure', path.join(output, side), filename], roots[side]);
			round[side] = JSON.parse(await readFile(filename, 'utf8'));
			if (JSON.stringify(round[side].measurement) !== JSON.stringify(measurement))
				throw new Error(
					`Measurement protocol differs in ${filename}; rerun the comparison before summarizing`
				);
		}
		rounds.push(round);
		console.log(`Completed comparison round ${index + 1}/4`);
	}
	const comparisons = {};
	for (const kind of kinds) {
		comparisons[kind] = {};
		const failures = rounds.flatMap((round, index) =>
			['before', 'after'].flatMap((side) =>
				round[side][kind].error ? [{ round: index, side, error: round[side][kind].error }] : []
			)
		);
		if (failures.length) {
			comparisons[kind] = { unavailable: failures };
			continue;
		}
		for (const metric of Object.keys(rounds[0].before[kind].median)) {
			const baseline = rounds.map((round) => round.before[kind].median[metric]);
			const candidate = rounds.map((round) => round.after[kind].median[metric]);
			const changes = baseline.map((value, index) =>
				value === 0 ? 0 : (candidate[index] / value - 1) * 100
			);
			const beforeValue = median(baseline);
			const afterValue = median(candidate);
			comparisons[kind][metric] = {
				before: beforeValue,
				after: afterValue,
				changePercent: beforeValue === 0 ? 0 : (afterValue / beforeValue - 1) * 100,
				roundChangeRange: [Math.min(...changes), Math.max(...changes)]
			};
		}
	}
	const report = {
		measuredAt: new Date().toISOString(),
		environment: { node: process.version, platform: process.platform, cpu: cpus()[0]?.model },
		revisions: Object.fromEntries(
			Object.entries(roots).map(([side, root]) => [
				side,
				{
					root,
					commit: execFileSync('git', ['rev-parse', 'HEAD'], {
						cwd: root,
						encoding: 'utf8'
					}).trim(),
					dirty:
						execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
							cwd: root,
							encoding: 'utf8'
						}).trim() !== ''
				}
			])
		),
		count,
		updates,
		samples,
		warmups,
		serverWarmups,
		browserPhaseIsolation: true,
		artifacts,
		comparisons,
		rounds,
		limitations: [
			'Each browser workload measures mount/updates and hydration in separate fresh processes.',
			'Server timing uses a separate process without a DOM or interleaved client allocation.',
			'JSDOM does not measure browser layout or paint.',
			'Baseline target placement uses explicit children; candidate uses self-closing supplied-target syntax.',
			'Baseline is the last committed revision before the complete uncommitted change, including document/child composition.',
			'New automatic fragment-host behavior has no identical baseline and is excluded.',
			'Failed workloads are recorded as unavailable, never used as faster timing results.',
			'Hydration timings include any old-runtime replacement work; identity counts are recorded separately.'
		]
	};
	await writeFile(path.join(output, 'comparison.json'), JSON.stringify(report, null, 2) + '\n');
	console.log(JSON.stringify(comparisons, null, 2));
}

/** Stages identical private sources, with the single required epoch-1 syntax adaptation. */
async function build(root, output, before) {
	const fixture = path.join(root, '.tmp', 'enhancement-comparison-fixture');
	await mkdir(fixture, { recursive: true });
	await cp(path.join(workspace, 'scripts/performance-fixtures/enhancement-comparison'), fixture, {
		recursive: true
	});
	await writeFile(
		path.join(fixture, 'package.json'),
		JSON.stringify({
			name: '@exactjs/enhancement-comparison-fixture',
			version: '0.0.0',
			private: true,
			type: 'module'
		})
	);
	await writeFile(
		path.join(fixture, 'tsconfig.json'),
		JSON.stringify({
			extends: '../../tsconfig.base.json',
			compilerOptions: { noEmit: true },
			include: ['*.ts', '*.tsx']
		})
	);
	if (before) {
		const filename = path.join(fixture, 'presentation.tsx');
		const source = await readFile(filename, 'utf8');
		await writeFile(
			filename,
			source.replace(
				'<_target title={props.label} />',
				'<_target title={props.label}>{props.children}</_target>'
			)
		);
	}
	const require = createRequire(path.join(root, 'package.json'));
	const { exact } = await import(pathToFileURL(require.resolve('@exactjs/vite-plugin')).href);
	const pluginRequire = createRequire(
		path.join(root, 'framework-adapters/vite-plugin/package.json')
	);
	const { build: viteBuild } = await import(pathToFileURL(pluginRequire.resolve('vite')).href);
	for (const target of ['client', 'server']) {
		const entry = path.join(fixture, `${target}.tsx`);
		await viteBuild({
			root: fixture,
			configFile: false,
			logLevel: 'warn',
			plugins: [
				exact({
					applicationRoot: fixture,
					target,
					renderMode: target === 'server' ? 'server-render' : 'client'
				})
			],
			build: {
				...(target === 'server' ? { ssr: entry } : {}),
				outDir: output,
				emptyOutDir: false,
				minify: false,
				target: 'es2022',
				rollupOptions: {
					input: entry,
					preserveEntrySignatures: 'strict',
					output: { entryFileNames: `${target}.mjs` }
				}
			}
		});
	}
}

/** Each side owns a fresh process, realm, and DOM; warmup work is excluded from stored samples. */
async function measure(directory, filename) {
	const serverFilename = `${filename}.server.json`;
	await run(['--measure-server', directory, serverFilename], process.cwd());
	const serverSamples = JSON.parse(await readFile(serverFilename, 'utf8'));
	const results = { measurement };
	for (const kind of kinds) {
		try {
			if (serverSamples[kind].error) throw new Error(serverSamples[kind].error);
			const phases = [];
			for (const phase of ['client', 'hydration']) {
				const phaseFilename = `${filename}.${kind}.${phase}.json`;
				await run([`--measure-${phase}`, directory, phaseFilename, kind], process.cwd());
				const result = JSON.parse(await readFile(phaseFilename, 'utf8'));
				if (result.error) throw new Error(result.error);
				phases.push(result.samples);
			}
			const observations = serverSamples[kind].samples.map((sample, index) => ({
				...sample,
				...phases[0][index],
				...phases[1][index]
			}));
			results[kind] = {
				samples: observations,
				median: Object.fromEntries(
					Object.keys(observations[0]).map((key) => [
						key,
						median(observations.map((value) => value[key]))
					])
				)
			};
		} catch (error) {
			results[kind] = { error: error instanceof Error ? error.message : String(error) };
		}
	}
	await writeFile(filename, JSON.stringify(results, null, 2) + '\n');
}

/** Isolates each browser workload and phase so earlier hydration allocations cannot bias updates. */
async function measureBrowser(directory, filename, kind, hydration) {
	const dom = installPerformanceDom();
	try {
		const client = await import(pathToFileURL(path.join(directory, 'client.mjs')).href);
		let results;
		try {
			const server = hydration
				? await import(pathToFileURL(path.join(directory, 'server.mjs')).href)
				: undefined;
			const output = server ? await server.hydrationOutput(kind, count) : undefined;
			const observations = [];
			for (let index = -warmups; index < samples; index++) {
				const observation = hydration
					? client.measureHydration(kind, count, output)
					: client.measureClient(kind, count, updates);
				if (index >= 0) observations.push(observation);
			}
			results = { samples: observations };
		} catch (error) {
			results = { error: error instanceof Error ? error.message : String(error) };
		}
		await writeFile(filename, JSON.stringify(results, null, 2) + '\n');
	} finally {
		dom.window.close();
	}
}

/** Times SSR without preceding DOM allocation or client work triggering collection in its samples. */
async function measureServer(directory, filename) {
	const server = await import(pathToFileURL(path.join(directory, 'server.mjs')).href);
	const results = {};
	for (const kind of kinds) {
		try {
			const observations = [];
			for (let index = -serverWarmups; index < samples; index++) {
				const observation = await server.measureServer(kind, count);
				if (index >= 0) observations.push(observation);
			}
			results[kind] = { samples: observations };
		} catch (error) {
			results[kind] = { error: error instanceof Error ? error.message : String(error) };
		}
	}
	await writeFile(filename, JSON.stringify(results, null, 2) + '\n');
}

/** Waits for each finite child and rejects failures before moving to another revision. */
function run(args, cwd) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [script, ...args], {
			cwd,
			stdio: 'inherit',
			windowsHide: true
		});
		child.once('error', reject);
		child.once('exit', (code, signal) =>
			code === 0 && !signal
				? resolve()
				: reject(new Error(`Comparison worker failed (${code ?? signal})`))
		);
	});
}
