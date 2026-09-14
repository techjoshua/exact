import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
	selectNpmReleasePackages,
	npmTrustArguments,
	npmSubmissionArguments,
	parseNpmTrustOutput,
	needsNpmTrust,
	npmTrustTarget
} from './npm-release-commands.mjs';

const trust = {
	id: 'trust-id',
	type: 'github',
	...npmTrustTarget,
	permissions: ['createStagedPackage']
};

test('trust setup selects public packages and includes only immediate native templates with the compiler', () => {
	const entry = (name, relativePath, extra = {}) => ({
		relativePath,
		manifest: { name, version: '0.5.0', ...extra }
	});
	const entries = [
		entry('@exactjs/compiler', 'packages/compiler/package.json'),
		entry('@exactjs/forms', 'component-libraries/forms/package.json'),
		entry('@exactjs/private', 'packages/private/package.json', { private: true }),
		entry(
			'@exactjs/compiler-native-linux-x64',
			'native/npm/compiler-native-linux-x64/package.json',
			{ private: true, exactNativeTarget: { os: 'linux', cpu: 'x64' } }
		),
		entry('@exactjs/fixture', 'native/npm/compiler-native-linux-x64/fixture/package.json', {
			exactNativeTarget: {}
		})
	];
	assert.deepEqual(
		selectNpmReleasePackages(entries).map((entry) => entry.manifest.name),
		['@exactjs/compiler', '@exactjs/forms', '@exactjs/compiler-native-linux-x64']
	);
	assert.equal(selectNpmReleasePackages(entries, ['@exactjs/forms']).length, 1);
	assert.throws(() => selectNpmReleasePackages(entries, ['@exactjs/private']));
});

test('trust grants only staging and submission preserves archive and tag', () => {
	const args = npmTrustArguments('@exactjs/core');
	assert.ok(args.includes('--allow-stage-publish'));
	assert.ok(args.includes('--no-allow-publish'));
	assert.ok(!args.includes('--allow-publish'));
	const submission = npmSubmissionArguments('a path/core.tgz', '0.5.1-beta.1', true);
	assert.deepEqual(submission.slice(0, 3), ['stage', 'publish', 'a path/core.tgz']);
	assert.ok(submission.includes('--tag=next'));
	assert.ok(npmSubmissionArguments('core.tgz', '0.5.0', false).includes('--tag=latest'));
});

test('trust output accepts multiple CLI JSON records and rejects malformed responses', () => {
	assert.deepEqual(parseNpmTrustOutput(' \n'), []);
	assert.deepEqual(
		parseNpmTrustOutput(
			`${JSON.stringify(trust, null, 2)}\n${JSON.stringify({ ...trust, id: 'escaped"{id}' })}`
		),
		[trust, { ...trust, id: 'escaped"{id}' }]
	);
	for (const output of [
		'garbage',
		'{',
		'{}',
		'{"error": "forbidden"}',
		JSON.stringify(trust) + 'oops'
	])
		assert.throws(() => parseNpmTrustOutput(output));
});

test('matching stage-only trusts are skipped; broader or unknown grants fail closed', () => {
	assert.equal(needsNpmTrust([]), true);
	assert.equal(needsNpmTrust([trust]), false);
	assert.equal(needsNpmTrust([{ ...trust, repository: 'someone/else' }]), true);
	for (const extra of [
		{ permissions: ['createPackage'] },
		{ permissions: ['createStagedPackage', 'createPackage'] },
		{ permissions: undefined },
		{ environment: 'production' }
	])
		assert.throws(() => needsNpmTrust([{ ...trust, ...extra }]), /conflicting/);
});

test('automated release grants OIDC only to staging and never invokes direct publication', async () => {
	const workflow = await readFile(
		new URL('../.github/workflows/native-compiler-packages.yml', import.meta.url),
		'utf8'
	);
	const job = workflow.split('  stage-npm-packages:')[1].split('  publish-pages:')[0];
	assert.match(job, /id-token: write/);
	assert.match(job, /inputs.stage/);
	assert.match(job, /npm run release:stage -- --execute/);
	assert.doesNotMatch(job, /release:publish|NODE_AUTH_TOKEN|NPM_TOKEN|stage approve/);
});

/** Runs executable scripts against an isolated fake npm CLI, without registry writes or built outputs. */
async function fakeNpm(t) {
	const directory = await mkdtemp(path.join(os.tmpdir(), 'exact-npm-release-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const cli = path.join(directory, 'npm.cjs');
	const log = path.join(directory, 'calls.jsonl');
	await writeFile(
		cli,
		`
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.EXACT_TEST_NPM_LOG, JSON.stringify(args) + '\\n');
if (args[0] === '--version') console.log('11.19.1');
else if (args[0] === 'view') {
 if (args[2] === 'name') console.log(JSON.stringify(args[1]));
 else if (args[2] === 'version') {
  console.log(JSON.stringify({ error: { code: 'E404' } })); process.exit(1);
 } else console.log(JSON.stringify(['0.5.0']));
} else if (args[0] === 'trust' && args[1] === 'list') {
 console.log(process.env.EXACT_TEST_NPM_TRUST || '');
}
`
	);
	return {
		directory,
		run(script, args, trustOutput = '') {
			return execFileSync(
				process.execPath,
				[fileURLToPath(new URL(script, import.meta.url)), ...args],
				{
					encoding: 'utf8',
					windowsHide: true,
					env: {
						...process.env,
						npm_execpath: cli,
						EXACT_TEST_NPM_LOG: log,
						EXACT_TEST_NPM_TRUST: trustOutput
					}
				}
			);
		},
		async calls() {
			return (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
		}
	};
}

test('bulk executable creates stage-only trust and skips a verified existing grant', async (t) => {
	const npm = await fakeNpm(t);
	npm.run('./configure-npm-trust.mjs', ['--packages=@exactjs/forms', '--execute']);
	const reads = (await npm.calls()).filter((args) => args[0] === 'trust' && args[1] === 'list');
	// Captured JSON output prevents npm from starting interactive web authentication.
	assert.ok(!reads[0].includes('--json'));
	assert.ok(reads[1].includes('--json'));
	assert.equal(
		(await npm.calls()).filter((args) => args[0] === 'trust' && args[1] === 'github').length,
		1
	);
	npm.run(
		'./configure-npm-trust.mjs',
		['--packages=@exactjs/forms', '--execute'],
		JSON.stringify(trust)
	);
	assert.equal(
		(await npm.calls()).filter((args) => args[0] === 'trust' && args[1] === 'github').length,
		1
	);
});

test('release executable submits the validated archive to staging, never direct publication', async (t) => {
	const npm = await fakeNpm(t);
	await mkdir(path.join(npm.directory, 'package'));
	await writeFile(
		path.join(npm.directory, 'package/package.json'),
		JSON.stringify({ name: '@exactjs/forms', version: '0.5.0' })
	);
	const archive = path.join(npm.directory, 'forms.tgz');
	execFileSync('tar', ['-czf', archive, '-C', npm.directory, 'package'], { windowsHide: true });
	npm.run('./publish-release-npm.mjs', [
		'--stage',
		'--execute',
		'--packages=@exactjs/forms',
		`--directory=${npm.directory}`
	]);
	const calls = await npm.calls();
	assert.deepEqual(
		calls.filter((args) => args[0] === 'stage'),
		[npmSubmissionArguments(archive, '0.5.0', true)]
	);
	assert.ok(!calls.some((args) => args[0] === 'publish'));
});
