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
	parseNpmRegistryString,
	planNpmTrust,
	npmTrustRevokeArguments,
	npmTrustTarget
} from './npm-release-commands.mjs';

const trust = {
	id: 'trust-id',
	type: 'github',
	...npmTrustTarget,
	permissions: ['createPackage']
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

test('trust grants direct publication and submission preserves archive and tag', () => {
	const args = npmTrustArguments('@exactjs/core');
	assert.ok(args.includes('--allow-publish'));
	assert.ok(args.includes('--no-allow-stage-publish'));
	assert.ok(!args.includes('--allow-stage-publish'));
	const submission = npmSubmissionArguments('a path/core.tgz', '0.6.0-beta.1');
	assert.deepEqual(submission.slice(0, 2), ['publish', 'a path/core.tgz']);
	assert.ok(submission.includes('--tag=next'));
	assert.ok(npmSubmissionArguments('core.tgz', '0.6.0').includes('--tag=latest'));
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

test('trust migration only replaces this workflow with known permissions', () => {
	assert.deepEqual(planNpmTrust([]), { create: true });
	assert.deepEqual(planNpmTrust([trust]), { create: false });
	for (const permissions of [['createStagedPackage'], ['createStagedPackage', 'createPackage']])
		assert.deepEqual(planNpmTrust([{ ...trust, permissions }]), {
			create: true,
			revokeId: trust.id
		});
	for (const extra of [
		{ repository: 'someone/else' },
		{ file: 'other.yml' },
		{ type: 'gitlab' },
		{ permissions: ['unknown'] },
		{ permissions: [] },
		{ permissions: undefined },
		{ permissions: ['createPackage', 'createPackage'] },
		{ environment: 'production' }
	])
		assert.throws(() => planNpmTrust([{ ...trust, ...extra }]), /conflicting/);
	assert.throws(() => planNpmTrust([trust, trust]), /conflicting/);
});

test('automated direct publication is restricted to main after release validation', async () => {
	const workflow = await readFile(
		new URL('../.github/workflows/native-compiler-packages.yml', import.meta.url),
		'utf8'
	);
	const job = workflow.split('  publish-npm-packages:')[1].split('  publish-pages:')[0];
	assert.match(job, /id-token: write/);
	assert.match(job, /github.ref == 'refs\/heads\/main'/);
	assert.match(job, /github.event_name == 'push'/);
	assert.match(job, /github.event_name == 'workflow_dispatch' && inputs.publish/);
	assert.match(job, /needs:\s+- package/);
	assert.match(job, /npm run release:publish -- --execute/);
	assert.doesNotMatch(job, /release:stage|NODE_AUTH_TOKEN|NPM_TOKEN|stage approve/);
	assert.match(workflow, /cancel-in-progress: \$\{\{ github.ref != 'refs\/heads\/main' \}\}/);
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
 if (args[2] === 'name') console.log(process.env.EXACT_TEST_NPM_NAME || JSON.stringify(args[1]));
 else if (args[2] === 'version' && process.env.EXACT_TEST_NPM_VERSION) console.log(process.env.EXACT_TEST_NPM_VERSION);
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
		run(script, args, trustOutput = '', registryOutput = {}) {
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
						EXACT_TEST_NPM_TRUST: trustOutput,
						...registryOutput
					}
				}
			);
		},
		async calls() {
			return (await readFile(log, 'utf8')).trim().split('\n').map(JSON.parse);
		}
	};
}

test('bulk executable creates direct-publish trust and skips a verified existing grant', async (t) => {
	const npm = await fakeNpm(t);
	const output = npm.run('./configure-npm-trust.mjs', ['--packages=@exactjs/forms', '--execute']);
	assert.match(output, /\[1\/1\] Checking registry identity: @exactjs\/forms/);
	assert.match(output, /\[1\/1\] Checking existing trust: @exactjs\/forms/);
	assert.match(output, /Preflight complete: 1 trust operations/);
	assert.match(output, /\[1\/1\] Creating direct-publish trust: @exactjs\/forms/);
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

test('release executable publishes the validated archive directly', async (t) => {
	const npm = await fakeNpm(t);
	const { version } = JSON.parse(
		await readFile(new URL('../component-libraries/forms/package.json', import.meta.url), 'utf8')
	);
	await mkdir(path.join(npm.directory, 'package'));
	await writeFile(
		path.join(npm.directory, 'package/package.json'),
		JSON.stringify({ name: '@exactjs/forms', version })
	);
	const archive = path.join(npm.directory, 'forms.tgz');
	execFileSync('tar', ['-czf', archive, '-C', npm.directory, 'package'], { windowsHide: true });
	npm.run('./publish-release-npm.mjs', [
		'--execute',
		'--packages=@exactjs/forms',
		`--directory=${npm.directory}`
	]);
	const calls = await npm.calls();
	assert.deepEqual(
		calls.filter((args) => args[0] === 'publish'),
		[npmSubmissionArguments(archive, version)]
	);
	assert.ok(!calls.some((args) => args[0] === 'stage'));
	assert.throws(
		() => npm.run('./publish-release-npm.mjs', ['--stage', '--execute']),
		/Staged publishing is no longer supported/
	);
});

test('bulk setup migrates a verified staging grant and leaves unrelated publishers untouched', async (t) => {
	const npm = await fakeNpm(t);
	const args = ['--packages=@exactjs/forms', '--execute'];
	npm.run(
		'./configure-npm-trust.mjs',
		args,
		JSON.stringify({ ...trust, permissions: ['createStagedPackage'] })
	);
	const mutations = (await npm.calls()).filter((args) => args[0] === 'trust' && args[1] !== 'list');
	assert.deepEqual(mutations, [
		npmTrustRevokeArguments('@exactjs/forms', trust.id),
		npmTrustArguments('@exactjs/forms')
	]);
	assert.throws(
		() =>
			npm.run(
				'./configure-npm-trust.mjs',
				args,
				JSON.stringify({ ...trust, repository: 'someone/else' })
			),
		/conflicting/
	);
	assert.deepEqual(
		(await npm.calls()).filter((args) => args[0] === 'trust' && args[1] !== 'list'),
		mutations
	);
});

test('registry string fields accept npm scalar and singleton results only', () => {
	for (const value of ['@exactjs/agent-skill', ['@exactjs/agent-skill']])
		assert.equal(parseNpmRegistryString(JSON.stringify(value)), '@exactjs/agent-skill');
	for (const value of [[], ['a', 'b'], [['a']], {}, null, 42, '', [null]])
		assert.throws(() => parseNpmRegistryString(JSON.stringify(value)), /one npm registry/);
	assert.throws(() => parseNpmRegistryString('not JSON'));
});

test('bulk trust preflight accepts npm array identities and rejects mismatches without mutations', async (t) => {
	const npm = await fakeNpm(t);
	const args = ['--packages=@exactjs/forms', '--execute'];
	npm.run('./configure-npm-trust.mjs', args, JSON.stringify(trust), {
		EXACT_TEST_NPM_NAME: JSON.stringify(['@exactjs/forms'])
	});
	for (const identity of [['@exactjs/other'], [], ['@exactjs/forms', '@exactjs/other']])
		assert.throws(() =>
			npm.run('./configure-npm-trust.mjs', args, JSON.stringify(trust), {
				EXACT_TEST_NPM_NAME: JSON.stringify(identity)
			})
		);
	assert.ok(!(await npm.calls()).some((args) => args[0] === 'trust' && args[1] !== 'list'));
});

test('publication skips versions returned as npm singleton arrays', async (t) => {
	const npm = await fakeNpm(t);
	const { version } = JSON.parse(
		await readFile(new URL('../component-libraries/forms/package.json', import.meta.url), 'utf8')
	);
	await mkdir(path.join(npm.directory, 'package'));
	await writeFile(
		path.join(npm.directory, 'package/package.json'),
		JSON.stringify({ name: '@exactjs/forms', version })
	);
	const archive = path.join(npm.directory, 'forms.tgz');
	execFileSync('tar', ['-czf', archive, '-C', npm.directory, 'package'], { windowsHide: true });
	const args = ['--execute', '--packages=@exactjs/forms', `--directory=${npm.directory}`];
	for (const result of [version, [version]])
		npm.run('./publish-release-npm.mjs', args, '', {
			EXACT_TEST_NPM_VERSION: JSON.stringify(result)
		});
	assert.throws(() =>
		npm.run('./publish-release-npm.mjs', args, '', {
			EXACT_TEST_NPM_VERSION: JSON.stringify(['9.9.9'])
		})
	);
	assert.ok(!(await npm.calls()).some((args) => args[0] === 'publish' || args[0] === 'stage'));
});
