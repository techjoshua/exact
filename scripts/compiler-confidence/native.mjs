import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { summarizeGobcoCoverage } from './coverage.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const output = path.join(root, '.tmp/compiler-confidence/native');
const tools = path.join(root, '.tmp/compiler-confidence/tools');
const scratch = path.join(root, '.tmp/compiler-confidence/gobco-work');
const go = process.env.EXACT_GO || 'go';
const gobcoVersion = 'v1.3.4';
const started = new Date().toISOString();
await run(process.execPath, ['scripts/build-native-compiler.mjs', '--coverage'], root);
await mkdir(tools, { recursive: true });
await mkdir(scratch, { recursive: true });
const env = {
	...process.env,
	CGO_ENABLED: '0',
	GOBIN: tools,
	TMPDIR: scratch,
	TMP: scratch,
	TEMP: scratch,
	EXACT_CONFIDENCE_TEST_TMPDIR: tmpdir(),
	PATH: go.includes(path.sep)
		? path.dirname(path.resolve(go)) + path.delimiter + process.env.PATH
		: process.env.PATH
};
await run(go, ['install', `github.com/rillig/gobco@${gobcoVersion}`], root, env);
const summaries = [];
for (const owner of ['internal/exactcompiler', 'cmd/exactc']) {
	for (const metric of ['branch', 'condition']) {
		const name = owner.replaceAll('/', '-') + '-' + metric;
		const stats = path.join(output, name + '.json');
		await rm(stats, { force: true });
		const args = [
			...(metric === 'branch' ? ['-branch'] : []),
			'-test=-count=1',
			'-test=-exec=' +
				JSON.stringify(process.execPath) +
				' ' +
				JSON.stringify(path.join(root, 'scripts/compiler-confidence/test-exec.mjs')),
			'-stats',
			stats
		];
		const log = await run(
			path.join(tools, process.platform === 'win32' ? 'gobco.exe' : 'gobco'),
			args,
			path.join(root, '.tmp/native-typescript-go/tsc', owner),
			env,
			true
		);
		await writeFile(path.join(output, name + '.log'), log);
		const summary = summarizeGobcoCoverage(JSON.parse(await readFile(stats, 'utf8')), metric);
		summaries.push({ owner, ...summary });
		console.log(
			`${owner} ${metric}: ${summary.covered}/${summary.outcomes} (${summary.percent.toFixed(1)}%)`
		);
	}
}
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirty =
	execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '';
await writeFile(
	path.join(output, 'coverage.json'),
	JSON.stringify(
		{
			version: 1,
			started,
			finished: new Date().toISOString(),
			revision,
			dirty,
			provenanceLimit: dirty
				? 'Uncommitted sources were tested. This SHA does not reproduce the tested variant.'
				: undefined,
			go: execFileSync(go, ['version'], { encoding: 'utf8' }).trim(),
			gobcoVersion,
			compilerBuild: JSON.parse(
				await readFile(
					path.join(root, '.tmp/native-compiler', `${process.platform}-${process.arch}.build.json`),
					'utf8'
				)
			),
			statements: JSON.parse(await readFile(path.join(output, 'statements.json'), 'utf8')),
			summaries,
			limits: [
				'Gobco does not cover select statements or prove condition combinations (MC/DC).',
				'Statement coverage remains necessary for code without instrumented conditions.',
				'These metrics describe native unit tests, not compiler subprocesses run by Vitest.'
			]
		},
		null,
		2
	) + '\n'
);

function run(command, args, cwd, env = process.env, capture = false) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			cwd,
			env,
			stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit'
		});
		let log = '';
		if (capture) {
			child.stdout.on('data', (chunk) => {
				log += chunk;
			});
			child.stderr.on('data', (chunk) => {
				log += chunk;
			});
		}
		child.once('error', reject);
		child.once('exit', (code, signal) =>
			code === 0 && !signal
				? resolve(log)
				: reject(new Error(`${command} failed (${signal ?? code})\n${log}`))
		);
	});
}
