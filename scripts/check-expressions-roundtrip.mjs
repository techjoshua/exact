import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';
import {
	appendExpressionCorpusHistory,
	batchExpressionCorpusGroups,
	defaultExpressionCorpusBatchSize,
	defaultExpressionCorpusWorkerHeapMb,
	expressionCorpusRunRecord,
	expressionCorpusTrend,
	isExpressionCorpusProject,
	isExpressionCorpusSource,
	positiveInteger,
	readExpressionCorpusBaseline,
	writeExpressionCorpusBaseline
} from './expression-corpus/measurement.mjs';

const root = path.resolve(import.meta.dirname, '..');
const profiles = [];
if (process.argv[2] === '--group') {
	const input = await readStandardInput();
	const { config, filenames, profileDetail } = JSON.parse(input);
	process.stdout.write(JSON.stringify(await checkGroup(config, filenames, profileDetail)));
} else {
	const corpusStarted = performance.now();
	const files = await collectSources(root);
	const groups = new Map();
	const projectEligibility = new Map();
	for (const filename of files) {
		const config = nearestConfig(path.dirname(filename));
		if (!config) throw new Error(`No tsconfig.json found for ${filename}`);
		let eligible = projectEligibility.get(config);
		if (eligible === undefined) {
			eligible = await expressionCorpusProject(config);
			projectEligibility.set(config, eligible);
		}
		if (!eligible) continue;
		const group = groups.get(config) ?? [];
		group.push(filename);
		groups.set(config, group);
	}

	const batchSize = positiveInteger(
		process.env.EXACT_EXPRESSION_BATCH_SIZE,
		defaultExpressionCorpusBatchSize,
		'EXACT_EXPRESSION_BATCH_SIZE'
	);
	const entries = batchExpressionCorpusGroups(
		[...groups].sort((left, right) => right[1].length - left[1].length),
		batchSize
	);
	const concurrency = positiveInteger(
		process.env.EXACT_EXPRESSION_WORKERS,
		Math.min(4, Math.max(2, os.availableParallelism() - 1)),
		'EXACT_EXPRESSION_WORKERS'
	);
	const workerHeapMb = positiveInteger(
		process.env.EXACT_EXPRESSION_WORKER_HEAP_MB,
		defaultExpressionCorpusWorkerHeapMb,
		'EXACT_EXPRESSION_WORKER_HEAP_MB'
	);
	const profileDetail = expressionProfileDetail(process.env.EXACT_EXPRESSION_PROFILE_DETAIL);
	let cursor = 0;
	const checked = entries.reduce((count, [, filenames]) => count + filenames.length, 0);
	const baseline = await readExpressionCorpusBaseline(root);
	let failure;
	try {
		await Promise.all(
			Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
				while (cursor < entries.length) {
					const [config, filenames] = entries[cursor++];
					await runAdaptiveGroup(config, filenames, workerHeapMb, profileDetail);
				}
			})
		);
	} catch (error) {
		failure = error;
	}
	const elapsedMs = performance.now() - corpusStarted;
	const record = expressionCorpusRunRecord({
		status: failure ? 'failed' : 'passed',
		elapsedMs,
		workers: concurrency,
		workerHeapMb,
		batchSize,
		profileDetail,
		fileCount: checked,
		projectCount: groups.size,
		batchCount: entries.length,
		peakWorkerRssMb: Math.max(0, ...profiles.map((profile) => profile.maxRssMb ?? 0)),
		baseline,
		...(failure ? { error: failure instanceof Error ? failure.message : String(failure) } : {})
	});
	await appendExpressionCorpusHistory(root, record);
	if (!failure) {
		await writeProfile(profiles, concurrency, checked, groups.size, record);
		if (process.argv.includes('--update-baseline'))
			await writeExpressionCorpusBaseline(root, record);
		console.log(
			`@exactjs/expressions losslessly round-tripped ${checked} source files across ${groups.size} projects in ${(elapsedMs / 1_000).toFixed(1)}s (${expressionCorpusTrend(record)}; ${record.peakWorkerRssMb} MB peak worker RSS)`
		);
		printProfileSummary(profiles);
	} else {
		console.error(
			`Expression corpus failed after ${(elapsedMs / 1_000).toFixed(1)}s; measurement appended to .tmp/expression-corpus-history.json`
		);
		throw failure;
	}
}

async function checkGroup(config, filenames, profileDetail = 'summary') {
	const { createExpressionProject } = await import('../packages/expressions/dist/index.js');
	const { createProfileCollector } = await import('../packages/instrumentation/dist/index.js');
	const collector = createProfileCollector();
	const started = performance.now();
	// The corpus validates binding and lossless emission but never consumes
	// semantic diagnostics. Syntax mode retains those invariants without eagerly
	// calculating and projecting diagnostics that are discarded.
	const project = createExpressionProject({
		tsconfigPath: config,
		diagnostics: 'syntax',
		profileDetail,
		onProfile: collector.sink
	});
	try {
		const modules = project.loadModules(filenames);
		for (const filename of filenames) {
			const module = modules.get(normalize(filename));
			if (!module) throw new Error(`Expression project omitted ${filename}`);
			if (module.emit({ format: 'preserve' }).code !== module.source)
				throw new Error(`Lossless round trip changed ${filename}`);
		}
		return {
			config,
			filenames: filenames.map((filename) => path.relative(root, filename)),
			fileCount: filenames.length,
			elapsedMs: performance.now() - started,
			maxRssMb: Math.ceil(process.resourceUsage().maxRSS / 1_024),
			profileDetail,
			events: collector.snapshot()
		};
	} finally {
		project.dispose();
	}
}

function runGroup(config, filenames, workerHeapMb, profileDetail) {
	return new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[`--max-old-space-size=${workerHeapMb}`, import.meta.filename, '--group'],
			{
				cwd: root,
				stdio: ['pipe', 'pipe', 'pipe']
			}
		);
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk) => {
			stdout += chunk;
		});
		child.stderr.on('data', (chunk) => {
			stderr += chunk;
		});
		child.once('error', reject);
		child.once('exit', (code) => {
			if (code !== 0) {
				reject(
					Object.assign(
						new Error(
							`Expression round-trip worker exited ${code} for ${config}\nFiles: ${filenames.map((filename) => path.relative(root, filename)).join(', ')}${stderr ? `\n${stderr}` : ''}`
						),
						{ exitCode: code }
					)
				);
				return;
			}
			try {
				resolve(JSON.parse(stdout));
			} catch (error) {
				reject(
					new Error(`Expression worker returned an invalid profile for ${config}`, { cause: error })
				);
			}
		});
		child.stdin.end(JSON.stringify({ config, filenames, profileDetail }));
	});
}

async function runAdaptiveGroup(config, filenames, workerHeapMb, profileDetail) {
	try {
		profiles.push(await runGroup(config, filenames, workerHeapMb, profileDetail));
	} catch (error) {
		if (filenames.length === 1) throw error;
		const middle = Math.ceil(filenames.length / 2);
		await runAdaptiveGroup(config, filenames.slice(0, middle), workerHeapMb, profileDetail);
		await runAdaptiveGroup(config, filenames.slice(middle), workerHeapMb, profileDetail);
	}
}

async function writeProfile(projects, workers, fileCount, projectCount, measurement) {
	const directory = path.join(root, '.tmp');
	await mkdir(directory, { recursive: true });
	await writeFile(
		path.join(directory, 'expression-corpus-profile.json'),
		`${JSON.stringify(
			{
				schemaVersion: 2,
				generatedAt: new Date().toISOString(),
				workers,
				fileCount,
				projectCount,
				measurement,
				projects: projects.map((project) => ({
					...project,
					config: path.relative(root, project.config),
					events: project.events.map((event) => ({
						...event,
						...(event.filename ? { filename: path.relative(root, event.filename) } : {})
					}))
				}))
			},
			null,
			2
		)}\n`
	);
}

function printProfileSummary(projects) {
	const phases = new Map();
	for (const event of projects.flatMap((project) => project.events)) {
		phases.set(event.phase, (phases.get(event.phase) ?? 0) + event.elapsedMs);
	}
	const printPhases = (title, names) => {
		console.log(title);
		for (const [phase, elapsedMs] of names
			.map((phase) => [phase, phases.get(phase) ?? 0])
			.sort((left, right) => right[1] - left[1])) {
			console.log(`  ${phase.padEnd(34)} ${(elapsedMs / 1_000).toFixed(1).padStart(7)}s`);
		}
	};
	printPhases('Expression corpus top-level summed worker time:', [
		'configuration',
		'program',
		'syntax-diagnostics',
		'semantic-diagnostics',
		'module-projection'
	]);
	if (!projects.some((project) => project.profileDetail === 'detailed')) return;
	printPhases('Module projection stage breakdown:', [
		'projection-identity',
		'projection-node-conversion',
		'projection-finalization'
	]);
	printPhases('Node conversion exclusive breakdown:', [
		'projection-node-metadata',
		'projection-node-types',
		'projection-node-bindings',
		'projection-node-common',
		'projection-node-specialization',
		'projection-node-overhead'
	]);
	printPhases('Type projection exclusive breakdown:', [
		'projection-type-display',
		'projection-type-members',
		'projection-type-signatures',
		'projection-type-properties',
		'projection-type-arguments',
		'projection-type-directives',
		'projection-type-construction'
	]);

	const typeEvents = projects
		.flatMap((project) => project.events)
		.filter((event) => event.phase === 'projection-node-types');
	const total = (field) => typeEvents.reduce((sum, event) => sum + (event[field] ?? 0), 0);
	const typeHits = total('typeCacheHits');
	const typeMisses = total('typeCacheMisses');
	const shallowHits = total('shallowTypeCacheHits');
	const shallowMisses = total('shallowTypeCacheMisses');
	const ratio = (hits, misses) =>
		hits + misses === 0 ? 'n/a' : `${((hits / (hits + misses)) * 100).toFixed(1)}%`;
	console.log('Projection query counters:');
	console.log(
		`  checker type queries              ${total('checkerTypeQueries').toLocaleString()}`
	);
	console.log(
		`  type cache hit rate               ${ratio(typeHits, typeMisses)} (${typeHits.toLocaleString()} hits / ${typeMisses.toLocaleString()} misses)`
	);
	console.log(
		`  shallow type cache hit rate       ${ratio(shallowHits, shallowMisses)} (${shallowHits.toLocaleString()} hits / ${shallowMisses.toLocaleString()} misses)`
	);
	const allEvents = projects.flatMap((project) => project.events);
	const totalAcross = (phase, field) =>
		allEvents
			.filter((event) => event.phase === phase)
			.reduce((sum, event) => sum + (event[field] ?? 0), 0);
	console.log(
		`  checker symbol queries            ${totalAcross('projection-node-bindings', 'checkerSymbolQueries').toLocaleString()}`
	);
	console.log(
		`  resolved signature queries        ${totalAcross('projection-node-specialization', 'resolvedSignatureQueries').toLocaleString()}`
	);
	console.log(
		`  directive characters scanned      ${totalAcross('projection-node-common', 'directiveCharacters').toLocaleString()}`
	);
}

function expressionProfileDetail(value) {
	if (value === undefined || value === '') return 'summary';
	if (value === 'summary' || value === 'detailed') return value;
	throw new Error(
		`EXACT_EXPRESSION_PROFILE_DETAIL must be "summary" or "detailed", received ${JSON.stringify(value)}`
	);
}

async function readStandardInput() {
	let input = '';
	for await (const chunk of process.stdin) input += chunk;
	return input;
}

async function collectSources(directory) {
	const output = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (
			entry.name === 'node_modules' ||
			entry.name === 'dist' ||
			entry.name === '.git' ||
			entry.name === '.tmp'
		)
			continue;
		const filename = path.join(directory, entry.name);
		if (entry.isDirectory()) output.push(...(await collectSources(filename)));
		else if (isExpressionCorpusSource(entry.name)) output.push(filename);
	}
	return output;
}

async function expressionCorpusProject(config) {
	const read = ts.readConfigFile(config, ts.sys.readFile);
	if (read.error) return false;
	const parsed = ts.parseJsonConfigFileContent(
		read.config,
		ts.sys,
		path.dirname(config),
		undefined,
		config
	);
	const manifest = nearestManifest(path.dirname(config));
	return isExpressionCorpusProject(
		manifest ? JSON.parse(await readFile(manifest, 'utf8')) : undefined,
		parsed.options.jsxImportSource
	);
}

function nearestManifest(directory) {
	let cursor = directory;
	while (cursor.startsWith(root)) {
		const candidate = path.join(cursor, 'package.json');
		if (existsSync(candidate)) return candidate;
		const parent = path.dirname(cursor);
		if (parent === cursor) break;
		cursor = parent;
	}
	return undefined;
}

function nearestConfig(directory) {
	let cursor = directory;
	while (cursor.startsWith(root)) {
		const candidate = path.join(cursor, 'tsconfig.json');
		if (existsSync(candidate)) return candidate;
		const parent = path.dirname(cursor);
		if (parent === cursor) break;
		cursor = parent;
	}
	return undefined;
}

function normalize(filename) {
	return path.resolve(filename).replace(/\\/g, '/');
}
