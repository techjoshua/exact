import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Session } from 'node:inspector/promises';
import { SourceMap } from 'node:module';
import { cpus, release } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { installPerformanceDom } from './performance/dom-environment.mjs';
import { summarizeProfile } from './performance/profile-summary.mjs';

const root = path.resolve(import.meta.dirname, '..');
const directory = path.resolve(process.argv[3] ?? path.join(root, '.tmp/enhancement-profile'));
const kinds = ['plain', 'intrinsic', 'component', 'explicit', 'intl'];
const lanes = ['client', 'hydration', 'server'];
const count = 100;
const updates = 10;
const interval = 100;

if (process.argv[2] === '--worker') {
	await profileWorker(process.argv[4], process.argv[5], process.argv[6]);
} else {
	if (process.argv[2] !== undefined && process.argv[2] !== '--output')
		throw new Error('Usage: node scripts/profile-enhancement-comparison.mjs [--output directory]');
	await mkdir(directory, { recursive: true });
	const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
		cwd: root,
		encoding: 'utf8'
	}).trim();
	const changes = execFileSync('git', ['diff', '--stat'], { cwd: root, encoding: 'utf8' });
	const fixture = path.join(directory, 'artifacts');
	run('scripts/benchmark-enhancement-comparison.mjs', [
		'--build',
		root,
		fixture,
		'after',
		'--sourcemap'
	]);
	const artifacts = {};
	for (const target of ['client', 'server']) {
		const bytes = await readFile(path.join(fixture, `${target}.mjs`));
		artifacts[target] = {
			bytes: bytes.length,
			sha256: createHash('sha256').update(bytes).digest('hex')
		};
	}
	await writeFile(
		path.join(directory, 'environment.json'),
		JSON.stringify(
			{
				measuredAt: new Date().toISOString(),
				revision,
				changes,
				worktreeStatus: execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }),
				artifacts,
				node: process.version,
				platform: process.platform,
				kernel: release(),
				cpu: cpus()[0]?.model,
				count,
				updates,
				intervalMicroseconds: interval,
				profileRounds: 2,
				clientWarmups: 20,
				serverWarmups: 500,
				clientIterations: 150,
				serverIterations: 1000
			},
			null,
			2
		)
	);
	// Unprofiled timings use the unchanged protocol, in fresh processes before any profiler runs.
	for (let round = 0; round < 2; round++) {
		const filename = path.join(directory, `timing-${round}.json`);
		run('scripts/benchmark-enhancement-comparison.mjs', ['--measure', fixture, filename]);
		const timing = JSON.parse(await readFile(filename, 'utf8'));
		for (const kind of kinds) {
			if (timing[kind]?.error || !timing[kind]?.samples?.length)
				throw new Error(
					`Timing workload failed: ${kind}: ${timing[kind]?.error ?? 'missing samples'}`
				);
		}
	}
	for (let round = 0; round < 2; round++) {
		for (const kind of round ? [...kinds].reverse() : kinds) {
			for (const lane of lanes) {
				run('scripts/profile-enhancement-comparison.mjs', [
					'--worker',
					directory,
					kind,
					lane,
					String(round)
				]);
				console.log(`Profiled ${kind}/${lane}, round ${round + 1}`);
			}
		}
	}
}

/** Runs finite workers serially; a failed correctness assertion aborts the capture. */
function run(script, args) {
	const child = spawnSync(process.execPath, [path.join(root, script), ...args], {
		cwd: root,
		stdio: 'inherit'
	});
	if (child.error) throw child.error;
	if (child.status !== 0)
		throw new Error(`Worker failed: ${script} (${child.status ?? child.signal})`);
}

/** Profiles warmed fixture phases, excluding input parsing, assertions, and final unmount. */
async function profileWorker(kind, lane, round) {
	if (!kinds.includes(kind) || !lanes.includes(lane)) throw new Error('Unknown profiling workload');
	const dom = lane === 'server' ? undefined : installPerformanceDom();
	const session = new Session();
	session.connect();
	try {
		const fixture = path.join(directory, 'artifacts');
		const client =
			lane === 'server' ? undefined : await import(pathToFileURL(path.join(fixture, 'client.mjs')));
		const server =
			lane === 'client' ? undefined : await import(pathToFileURL(path.join(fixture, 'server.mjs')));
		const output = lane === 'hydration' ? await server.hydrationOutput(kind, count) : undefined;
		const exercise = (observe) => {
			const result =
				lane === 'server'
					? server.measureServer(kind, count, observe)
					: lane === 'hydration'
						? client.measureHydration(kind, count, output, observe)
						: client.measureClient(kind, count, updates, observe);
			if (
				lane === 'hydration' &&
				(result.replacedElements !== 0 || result.hydrationOwners !== count)
			)
				throw new Error('Hydration replaced elements or failed to retain every receiver');
			return result;
		};
		for (let index = 0; index < (lane === 'server' ? 500 : 20); index++) await exercise();
		const windows = [];
		let active;
		const observe = (phase, entering) => {
			const time = Number(process.hrtime.bigint() / 1000n);
			if (entering) {
				if (active) throw new Error('Overlapping profile phases');
				active = { phase, start: time };
			} else {
				if (active?.phase !== phase) throw new Error('Unmatched profile phase');
				windows.push({ ...active, end: time });
				active = undefined;
			}
		};
		await session.post('Profiler.enable');
		await session.post('Profiler.setSamplingInterval', { interval });
		await session.post('Profiler.start');
		for (let index = 0; index < (lane === 'server' ? 1000 : 150); index++) await exercise(observe);
		const { profile } = await session.post('Profiler.stop');
		if (
			active ||
			!windows.length ||
			windows[0].start < profile.startTime ||
			windows.at(-1).end > profile.endTime
		)
			throw new Error('Profile phase clock or lifecycle mismatch');
		const maps = new Map();
		for (const target of ['client', 'server']) {
			const filename = path.join(fixture, `${target}.mjs`);
			maps.set(
				pathToFileURL(filename).href,
				new SourceMap(JSON.parse(await readFile(`${filename}.map`, 'utf8')))
			);
		}
		const summary = summarizeProfile(profile, windows, (frame) => {
			const mapped = maps.get(frame.url)?.findEntry(frame.lineNumber, frame.columnNumber);
			return {
				functionName: frame.functionName || '(anonymous)',
				url: mapped?.originalSource ?? frame.url,
				line: (mapped?.originalLine ?? frame.lineNumber) + 1
			};
		});
		const prefix = path.join(directory, `${round}-${kind}-${lane}`);
		await writeFile(`${prefix}.cpuprofile`, JSON.stringify(profile));
		await writeFile(`${prefix}.windows.json`, JSON.stringify(windows));
		await writeFile(`${prefix}.summary.json`, JSON.stringify(summary, null, 2));
	} finally {
		session.disconnect();
		dom?.window.close();
	}
}
