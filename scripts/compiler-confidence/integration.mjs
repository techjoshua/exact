import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	mergeNativeCoverageProfiles,
	modifiedPatchLines,
	summarizeNativeCoverage
} from './coverage.mjs';
import { verifyExecution } from './evidence.mjs';
import { witnesses } from './witnesses.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const output = path.join(root, '.tmp/compiler-confidence/integration');
const compilerRoot = path.join(root, '.tmp/native-typescript-go/tsc');
const go = process.env.EXACT_GO || 'go';
const started = new Date().toISOString();
await run(process.execPath, ['scripts/build-native-compiler.mjs']);
await rm(output, { recursive: true, force: true });
const captures = path.join(output, 'captures');
await mkdir(captures, { recursive: true });
const executable = path.join(output, process.platform === 'win32' ? 'exactc.exe' : 'exactc');
const packages = ['internal/exactcompiler', 'cmd/exactc', 'internal/compiler'];
const coverpkg = packages.map((owner) => 'github.com/microsoft/TypeScript/tsc/' + owner).join(',');
await run(
	go,
	[
		'test',
		'-count=1',
		'-covermode=atomic',
		'-coverpkg=' + coverpkg,
		'-coverprofile=' + path.join(output, 'unit.out'),
		'./internal/exactcompiler',
		'./cmd/exactc'
	],
	compilerRoot
);
await run(
	go,
	[
		'build',
		'-buildvcs=false',
		'-trimpath',
		'-cover',
		'-covermode=atomic',
		'-coverpkg=' + coverpkg,
		'-tags=exactcoverage',
		'-o',
		executable,
		'./cmd/exactc'
	],
	compilerRoot
);
const env = { ...process.env, EXACT_COMPILER_EXECUTABLE: executable, GOCOVERDIR: captures };
const executions = [];
const suiteExecutions = [];
for (const group of [
	{
		name: 'compiler',
		config: 'vitest.config.ts',
		directory: 'packages/compiler/src',
		prefix: 'packages/compiler/'
	},
	{
		name: 'composition',
		config: 'packages/component-composition-corpus/vitest.config.ts',
		directory: 'packages/component-composition-corpus/src',
		prefix: 'packages/component-composition-corpus/'
	},
	{
		name: 'localization',
		config: 'vitest.config.ts',
		directory: [
			'packages/intl-analyzer/src',
			'packages/intl-build/src',
			'packages/intl/src/language.test.ts',
			'packages/language-server/src/intl-language.integration.test.ts'
		],
		prefix: 'packages/intl-analyzer/'
	}
]) {
	const report = path.join(output, group.name + '.json');
	await run(
		process.execPath,
		[
			'node_modules/vitest/vitest.mjs',
			'run',
			'--config',
			group.config,
			...[group.directory].flat(),
			'--testTimeout=30000',
			'--reporter=default',
			'--reporter=json',
			'--outputFile.json=' + report
		],
		root,
		env
	);
	const reportData = JSON.parse(await readFile(report, 'utf8'));
	if (
		!reportData.success ||
		!reportData.numPassedTests ||
		reportData.numFailedTests ||
		reportData.numPendingTests
	)
		throw new Error(group.name + ' coverage suite did not execute every selected test');
	suiteExecutions.push({
		name: group.name,
		report: path.relative(root, report),
		passed: reportData.numPassedTests,
		files: reportData.testResults.map((file) => path.relative(root, file.name)),
		status: 'verified'
	});
	executions.push(
		...verifyExecution(
			reportData,
			witnesses.filter((w) => w.file.startsWith(group.prefix)),
			root
		)
	);
}
if (!(await readdir(captures)).some((file) => file.startsWith('covcounters.')))
	throw new Error('Compiler subprocess coverage was not captured');
await run(
	go,
	['tool', 'covdata', 'textfmt', '-i=' + captures, '-o=' + path.join(output, 'integration.out')],
	compilerRoot
);
const unit = await readFile(path.join(output, 'unit.out'), 'utf8');
const integration = await readFile(path.join(output, 'integration.out'), 'utf8');
const combined = mergeNativeCoverageProfiles([unit, integration]);
await writeFile(path.join(output, 'combined.out'), combined);
const owned = (profile) =>
	profile
		.split('\n')
		.filter(
			(line) =>
				line.startsWith('mode:') ||
				(/\/(internal\/exactcompiler|cmd\/exactc)\//.test(line) &&
					!line.includes('/coverage_enabled.go:'))
		)
		.join('\n');
const patches = await readFile(
	path.join(root, 'native/typescript-go/overlay/internal/compiler/program.patch'),
	'utf8'
);
const patchLines = modifiedPatchLines(patches);
const upstream = [];
for (const line of combined.split('\n')) {
	const record =
		/^(.*\/internal\/compiler\/(exact_jsx_reuse|program)\.go):(\d+)\.(\d+),(\d+)\.(\d+) (\d+) (\d+)$/.exec(
			line
		);
	if (!record) continue;
	const [, filename, name, startLine, startColumn, endLine, endColumn, statements, count] = record;
	const modifiedLines =
		name === 'program'
			? patchLines.filter((line) => line >= Number(startLine) && line <= Number(endLine))
			: undefined;
	if (name === 'program' && !modifiedLines.length) continue;
	upstream.push({
		filename,
		startLine: Number(startLine),
		startColumn: Number(startColumn),
		endLine: Number(endLine),
		endColumn: Number(endColumn),
		statements: Number(statements),
		executed: Number(count) > 0,
		modifiedLines
	});
}
if (
	!upstream.some((block) => block.filename.endsWith('/exact_jsx_reuse.go')) ||
	!upstream.some((block) => block.modifiedLines?.length)
)
	throw new Error('Upstream patch boundary coverage missing');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirty =
	execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '';
const result = {
	version: 1,
	started,
	finished: new Date().toISOString(),
	revision,
	dirty,
	provenanceLimit: dirty
		? 'Uncommitted sources were tested. This SHA does not reproduce the tested variant.'
		: undefined,
	compilerBuild: JSON.parse(
		await readFile(
			path.join(root, '.tmp/native-compiler', `${process.platform}-${process.arch}.build.json`),
			'utf8'
		)
	),
	go: execFileSync(go, ['version'], { encoding: 'utf8' }).trim(),
	scope: packages,
	unit: summarizeNativeCoverage(owned(unit)),
	integration: summarizeNativeCoverage(owned(integration)),
	combined: summarizeNativeCoverage(owned(combined)),
	upstreamPatchBlocks: upstream,
	executions,
	suiteExecutions,
	limits: [
		'Integration statement counters cover compiler, composition and selected localization analyzer/build/language suites, not every adapter or runtime suite.',
		'Gobco branch and condition outcomes remain separate native-unit measurements.',
		'Upstream patch blocks indicate execution, not branch completeness or semantic correctness. They are excluded from the eXact denominator.',
		'Coverage builds use atomic counters and a termination snapshot. Their timings are not performance evidence.'
	]
};
await writeFile(path.join(output, 'coverage.json'), JSON.stringify(result, null, 2) + '\n');
console.log(
	`Native statements: unit ${result.unit.percent.toFixed(1)}%, integration ${result.integration.percent.toFixed(1)}%, combined ${result.combined.percent.toFixed(1)}%`
);

/** Owns each finite build/test process through exit and fails on unsuccessful evidence. */
function run(command, args, cwd = root, env = process.env) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd, env, stdio: 'inherit' });
		child.once('error', reject);
		child.once('exit', (code, signal) =>
			code === 0 && !signal ? resolve() : reject(new Error(`${command} failed (${signal ?? code})`))
		);
	});
}
