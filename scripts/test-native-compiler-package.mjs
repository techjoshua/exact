import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const artifactDirectory = path.resolve(process.argv[2] ?? '');
if (!process.argv[2]) {
	throw new Error('Usage: node scripts/test-native-compiler-package.mjs <artifact directory>');
}
const npm = npmInvocation();
const archives = (await readdir(artifactDirectory))
	.filter((entry) => entry.endsWith('.tgz'))
	.map((entry) => path.join(artifactDirectory, entry));
assert.equal(archives.length, 1, `expected one native package archive in ${artifactDirectory}`);

const fixture = await mkdtemp(path.join(os.tmpdir(), 'exact-native-package-'));
try {
	await writeFile(
		path.join(fixture, 'package.json'),
		`${JSON.stringify({ name: 'exact-native-package-test', private: true })}\n`
	);
	await run(
		npm.command,
		[
			...npm.prefix,
			'install',
			'--ignore-scripts',
			'--no-audit',
			'--no-fund',
			'--no-package-lock',
			archives[0]
		],
		fixture
	);
	const packageName = `compiler-native-${process.platform}-${process.arch}`;
	const packageRoot = path.join(fixture, 'node_modules', '@exactjs', packageName);
	const manifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
	assert.deepEqual(manifest.os, [process.platform]);
	assert.deepEqual(manifest.cpu, [process.arch]);
	assert.equal(manifest.scripts, undefined, 'native package must not invoke a local toolchain');

	const executable = path.join(packageRoot, process.platform === 'win32' ? 'exactc.exe' : 'exactc');
	const response = await requestVersion(executable);
	const contracts = await readFile(
		path.resolve('native', 'typescript-go', 'overlay', 'internal', 'exactcompiler', 'contracts.go'),
		'utf8'
	);
	const expectedProtocol = contracts.match(/const ProtocolVersion = "([^"]+)"/)?.[1];
	assert.ok(expectedProtocol, 'native protocol version was not declared');
	assert.equal(response.protocolVersion, expectedProtocol);
	assert.match(response.typescriptVersion, /^7\./);
	assert.equal(response.backendVersion, expectedProtocol);
	assert.equal(response.error, undefined);
	console.log(
		`installed and executed ${manifest.name}@${manifest.version} on ${process.platform}-${process.arch}`
	);
} finally {
	await rm(fixture, { recursive: true, force: true });
}

/** Resolves npm without assuming a runner colocates its CLI with the Node executable. */
function npmInvocation() {
	const cli = process.env.npm_execpath;
	if (cli) return { command: process.execPath, prefix: [cli] };
	if (process.platform !== 'win32') return { command: 'npm', prefix: [] };
	return {
		command: process.env.ComSpec ?? 'cmd.exe',
		prefix: ['/d', '/s', '/c', 'npm.cmd']
	};
}

function requestVersion(executable) {
	return new Promise((resolve, reject) => {
		const child = spawn(executable, [], {
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true
		});
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk) => (stdout += chunk));
		child.stderr.on('data', (chunk) => (stderr += chunk));
		child.on('error', reject);
		child.on('exit', (code) => {
			if (code !== 0) {
				reject(new Error(`native package exited with ${code}: ${stderr}`));
				return;
			}
			try {
				resolve(JSON.parse(stdout.trim().split(/\r?\n/)[0]));
			} catch (error) {
				reject(new Error(`native package returned invalid JSON: ${stdout}`, { cause: error }));
			}
		});
		child.stdin.end('{"kind":"version"}\n{"kind":"shutdown"}\n');
	});
}

function run(command, arguments_, cwd) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, arguments_, {
			cwd,
			stdio: 'inherit',
			windowsHide: true
		});
		child.on('error', reject);
		child.on('exit', (code) => {
			if (code === 0) resolve();
			else reject(new Error(`${command} exited with ${code}`));
		});
	});
}
