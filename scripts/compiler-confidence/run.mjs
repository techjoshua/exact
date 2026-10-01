import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { languageFeatures, contractEdges } from './inventory.mjs';
import { witnesses } from './witnesses.mjs';
import { validateInventory, verifyExecution, resolveInventory } from './evidence.mjs';
import {
	createNativeCompilerBuildKey,
	isNativeCompilerBuildCurrent
} from '../native-compiler-build-cache.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const output = path.join(root, '.tmp/compiler-confidence/behavior');
validateInventory({ witnesses, languageFeatures, contractEdges });
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const target = `${process.platform}-${process.arch}`;
const executable =
	process.env.EXACT_COMPILER_EXECUTABLE ??
	path.join(root, '.tmp/native-compiler', process.platform === 'win32' ? 'exactc.exe' : 'exactc');
const stampFile =
	process.env.EXACT_COMPILER_BUILD_STAMP ??
	path.join(root, '.tmp/native-compiler', target + '.build.json');
const upstream = JSON.parse(
	await readFile(path.join(root, 'native/typescript-go/upstream.json'), 'utf8')
);
const buildKey = await createNativeCompilerBuildKey({
	repositoryRoot: root,
	revision: upstream.revision,
	target
});
if (!(await isNativeCompilerBuildCurrent({ executable, stampFile, buildKey }))) {
	if (process.env.EXACT_COMPILER_EXECUTABLE)
		throw new Error(
			'Compiler override requires a matching EXACT_COMPILER_BUILD_STAMP for current sources.'
		);
	await run(process.execPath, ['scripts/build-native-compiler.mjs']);
	if (!(await isNativeCompilerBuildCurrent({ executable, stampFile, buildKey })))
		throw new Error('Compiler sources changed during the build. Rerun confidence acceptance.');
}
process.env.EXACT_COMPILER_EXECUTABLE = executable;
const compilerBuild = JSON.parse(await readFile(stampFile, 'utf8'));
const groups = [
	{
		name: 'reactive',
		config: 'vitest.config.ts',
		witnesses: witnesses.filter((w) => w.file.startsWith('packages/reactive/'))
	},
	{
		name: 'compiler',
		config: 'vitest.config.ts',
		witnesses: witnesses.filter((w) => w.file.startsWith('packages/compiler/'))
	},
	{
		name: 'composition',
		config: 'packages/component-composition-corpus/vitest.config.ts',
		witnesses: witnesses.filter((w) => w.file.startsWith('packages/component-composition-corpus/'))
	}
];
const executions = [];
const started = new Date().toISOString();
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const dirty =
	execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '';
for (const group of groups) {
	const report = path.join(output, group.name + '.json');
	await run(process.execPath, [
		path.join(root, 'node_modules/vitest/vitest.mjs'),
		'run',
		'--config',
		group.config,
		...new Set(group.witnesses.map((w) => w.file)),
		'--testTimeout=30000',
		'--reporter=default',
		'--reporter=json',
		'--outputFile.json=' + report
	]);
	executions.push(
		...verifyExecution(JSON.parse(await readFile(report, 'utf8')), group.witnesses, root)
	);
}
const result = {
	version: 1,
	started,
	finished: new Date().toISOString(),
	revision,
	dirty,
	provenanceLimit: dirty
		? 'Uncommitted sources were executed. This SHA does not reproduce the tested variant.'
		: undefined,
	node: process.version,
	compilerBuild,
	extended: process.env.EXACT_EXTENDED_TESTING === '1',
	executions,
	languageFeatures: resolveInventory(languageFeatures, executions),
	contractEdges: resolveInventory(contractEdges, executions)
};
await writeFile(path.join(output, 'evidence.json'), JSON.stringify(result, null, 2) + '\n');
console.log(
	`Verified ${executions.length} execution witnesses. Known gaps remain explicit in ${output}/evidence.json`
);

function run(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd: root, env: process.env, stdio: 'inherit' });
		child.once('error', reject);
		child.once('exit', (code, signal) =>
			code === 0 && !signal ? resolve() : reject(new Error(`${command} failed (${signal ?? code})`))
		);
	});
}
