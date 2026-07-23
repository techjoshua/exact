import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const root = path.resolve(import.meta.dirname, '..');
const profiles = [];
if (process.argv[2] === '--group') {
	const input = await readStandardInput();
	const { config, filenames } = JSON.parse(input);
	process.stdout.write(JSON.stringify(await checkGroup(config, filenames)));
} else {
	const files = await collectSources(root);
	const groups = new Map();
	for (const filename of files) {
		const config = nearestConfig(path.dirname(filename));
		if (!config) throw new Error(`No tsconfig.json found for ${filename}`);
		const group = groups.get(config) ?? [];
		group.push(filename);
		groups.set(config, group);
	}

	const entries = [...groups].sort((left, right) => right[1].length - left[1].length);
	const concurrency = Math.max(
		1,
		Number.parseInt(
			process.env.EXACT_EXPRESSION_WORKERS ??
				String(Math.min(4, Math.max(2, os.availableParallelism() - 1))),
			10
		)
	);
	let cursor = 0;
	await Promise.all(
		Array.from({ length: Math.min(concurrency, entries.length) }, async () => {
			while (cursor < entries.length) {
				const [config, filenames] = entries[cursor++];
				await runAdaptiveGroup(config, filenames);
			}
		})
	);
	const checked = entries.reduce((count, [, filenames]) => count + filenames.length, 0);

	await writeProfile(profiles, concurrency, checked, groups.size);
	console.log(
		`@exactjs/expressions losslessly round-tripped ${checked} source files across ${groups.size} projects with ${concurrency} workers`
	);
	printProfileSummary(profiles);
}

async function checkGroup(config, filenames) {
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
		profileDetail: 'detailed',
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
			fileCount: filenames.length,
			elapsedMs: performance.now() - started,
			events: collector.snapshot()
		};
	} finally {
		project.dispose();
	}
}

function runGroup(config, filenames) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [import.meta.filename, '--group'], {
			cwd: root,
			stdio: ['pipe', 'pipe', 'pipe']
		});
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
							`Expression round-trip worker exited ${code} for ${config}${stderr ? `\n${stderr}` : ''}`
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
		child.stdin.end(JSON.stringify({ config, filenames }));
	});
}

async function runAdaptiveGroup(config, filenames) {
	try {
		profiles.push(await runGroup(config, filenames));
	} catch (error) {
		if (filenames.length === 1) throw error;
		const middle = Math.ceil(filenames.length / 2);
		await runAdaptiveGroup(config, filenames.slice(0, middle));
		await runAdaptiveGroup(config, filenames.slice(middle));
	}
}

async function writeProfile(projects, workers, fileCount, projectCount) {
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
		else if (/\.[cm]?[jt]sx?$/.test(entry.name) && !entry.name.endsWith('.d.ts'))
			output.push(filename);
	}
	return output;
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
