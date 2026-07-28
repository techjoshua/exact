import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');

if (!ts.version.startsWith('6.0.')) {
	throw new Error(
		`eXact compiler tooling must resolve the TypeScript 6 compatibility API; received ${ts.version}`
	);
}

runNpmScript('generate:app-artifacts', 'generated application artifacts');
run(
	path.join(root, 'node_modules', 'typescript', 'bin', 'tsc6'),
	['-b', '--force', '--pretty', 'false'],
	'TypeScript 6 compiler/API build'
);
run(
	path.join(root, 'node_modules', '@typescript', 'native', 'bin', 'tsc'),
	['-b', '--force', '--pretty', 'false'],
	'TypeScript 7 application compatibility build'
);

console.log(`TypeScript compatibility passed with API ${ts.version} and the TypeScript 7 CLI.`);

function runNpmScript(script, label) {
	const npmCli = process.env.npm_execpath;
	if (!npmCli) throw new Error(`npm_execpath is required to prepare ${label}`);
	run(npmCli, ['run', script], label);
}

function run(entrypoint, args, label) {
	const result = spawnSync(process.execPath, [entrypoint, ...args], {
		cwd: root,
		encoding: 'utf8'
	});
	if (result.stdout) process.stdout.write(result.stdout);
	if (result.stderr) process.stderr.write(result.stderr);
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
	}
}
