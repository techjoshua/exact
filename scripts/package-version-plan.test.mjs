import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readWorkspaceManifests } from './workspace-manifests.mjs';
import { planPackageVersions } from './package-version-plan.mjs';
import { selectReleaseWorkspaces } from './package-release-selection.mjs';
import { planNpmPublication } from './npm-publication-plan.mjs';

function entry(name, dependencies = {}, extra = {}, directory = 'packages') {
	return {
		relativePath: `${directory}/${name}/package.json`,
		manifest: {
			name: `@exactjs/${name}`,
			version: '0.1.0',
			dependencies,
			publishConfig: { access: 'public' },
			...extra
		}
	};
}

test('version planning updates the private comparison without reading generated participant packages', async (t) => {
	const root = await mkdtemp(join(tmpdir(), 'exact-version-comparison-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const inputs = [
		['packages/core', { name: '@exactjs/core', version: '0.1.0' }],
		[
			'framework-comparison',
			{
				name: '@exactjs/framework-comparison-suite',
				private: true,
				dependencies: { '@exactjs/core': '^0.1.0' }
			}
		],
		['framework-comparison/participants/exact-native', { name: 'native-fixture', private: true }],
		['framework-comparison/participants/nuxt/.output', { name: 'generated-output' }]
	];
	for (const [directory, manifest] of inputs) {
		await mkdir(join(root, directory), { recursive: true });
		await writeFile(join(root, directory, 'package.json'), JSON.stringify(manifest));
	}
	const entries = await readWorkspaceManifests(root);
	assert.equal(entries.length, 3);
	const plan = planPackageVersions(entries, '0.2.0', ['@exactjs/core']);
	const comparison = plan.changes.find(
		(entry) => entry.manifest.name === '@exactjs/framework-comparison-suite'
	);
	assert.equal(comparison.manifest.dependencies['@exactjs/core'], '^0.2.0');
});

test('a component patch leaves framework and compatible consumer manifests untouched', () => {
	const entries = [
		entry('core'),
		entry('forms', { '@exactjs/core': '^0.1.0' }),
		entry('app', { '@exactjs/forms': '^0.1.0' }, { private: true }, 'apps')
	];
	const before = structuredClone(entries);
	const plan = planPackageVersions(entries, '0.1.1', ['@exactjs/forms']);
	assert.deepEqual(
		plan.changes.map((item) => item.manifest.name),
		['@exactjs/forms']
	);
	assert.deepEqual(entries, before);
});

test('an incompatible range requires an explicitly versioned public dependent', () => {
	const entries = [entry('core'), entry('forms', { '@exactjs/core': '^0.1.0' })];
	assert.throws(
		() => planPackageVersions(entries, '1.0.0', ['@exactjs/core']),
		/forms must also be selected/
	);
	const plan = planPackageVersions(entries, '1.0.0');
	assert.equal(plan.changes[1].manifest.dependencies['@exactjs/core'], '^1.0.0');
});

test('compiler release versions native templates and their optional dependency ranges', () => {
	const entries = [
		entry(
			'compiler',
			{},
			{ optionalDependencies: { '@exactjs/compiler-native-linux-x64': '^0.1.0' } }
		),
		entry(
			'compiler-native-linux-x64',
			{},
			{ private: true, exactNativeTarget: { os: 'linux', cpu: 'x64' } },
			'native/npm'
		)
	];
	const plan = planPackageVersions(entries, '0.5.0', ['@exactjs/compiler']);
	assert.equal(plan.changes[1].manifest.version, '0.5.0');
	assert.equal(plan.changes[1].manifest.private, true);
	assert.equal(
		plan.changes[0].manifest.optionalDependencies['@exactjs/compiler-native-linux-x64'],
		'0.5.0'
	);
});

test('selection rejects apps, private fixtures, unknown packages and empty selections', () => {
	const entries = [entry('forms'), entry('app', {}, { private: true }, 'apps')];
	assert.equal(selectReleaseWorkspaces(entries).length, 1);
	for (const names of [[], ['@exactjs/app'], ['@exactjs/typo']]) {
		assert.throws(() => selectReleaseWorkspaces(entries, names));
		assert.throws(() => planPackageVersions(entries, '0.1.1', names));
	}
});

test('nested test packages are excluded even without a private marker', () => {
	const fixture = entry('fixture');
	fixture.relativePath = 'packages/compiler/test-fixtures/project/package.json';
	assert.deepEqual(selectReleaseWorkspaces([fixture]), []);
});

test('versions reject downgrades and malformed prereleases before mutation', () => {
	for (const version of ['0.0.9', '0.1.1-01', '0.1.1-', 'v0.1.1', '0.0.0'])
		assert.throws(() => planPackageVersions([entry('forms')], version));
});

test('publication skips existing versions and puts platform binaries before the host', async () => {
	const names = ['@exactjs/compiler', '@exactjs/forms', '@exactjs/compiler-native-linux-x64'];
	const expected = new Map(names.map((name) => [name, '0.1.0']));
	const archives = new Map(names.map((name) => [name, { manifest: { name, version: '0.1.0' } }]));
	const plan = await planNpmPublication(expected, archives, (name) => name === '@exactjs/forms');
	assert.deepEqual(
		plan.map((item) => item.manifest.name),
		[names[2], names[0]]
	);
});

test('publication fails closed on missing archives and registry outages', async () => {
	const expected = new Map([['@exactjs/forms', '0.1.0']]);
	await assert.rejects(
		planNpmPublication(expected, new Map(), () => assert.fail('registry must not be queried')),
		/Missing or invalid/
	);
	const archives = new Map([
		['@exactjs/forms', { manifest: { name: '@exactjs/forms', version: '0.1.0' } }]
	]);
	await assert.rejects(
		planNpmPublication(expected, archives, () => {
			throw new Error('registry unavailable');
		}),
		/registry unavailable/
	);
});

test('publication rejects unavailable internal dependencies before any publish operation', async () => {
	const name = '@exactjs/forms';
	for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
		const expected = new Map([[name, '0.5.0']]);
		const archives = new Map([
			[name, { manifest: { name, version: '0.5.0', [section]: { '@exactjs/core': '^0.5.0' } } }]
		]);
		await assert.rejects(
			planNpmPublication(
				expected,
				archives,
				() => false,
				() => []
			),
			/neither published nor selected/
		);
		await assert.rejects(
			planNpmPublication(
				expected,
				archives,
				() => false,
				() => ['0.4.0']
			),
			/neither published nor selected/
		);
		assert.equal(
			(
				await planNpmPublication(
					expected,
					archives,
					() => false,
					() => ['0.5.1']
				)
			).length,
			1
		);
		expected.set('@exactjs/core', '0.5.0');
		archives.set('@exactjs/core', { manifest: { name: '@exactjs/core', version: '0.5.0' } });
		assert.equal(
			(
				await planNpmPublication(
					expected,
					archives,
					() => false,
					() => assert.fail('selected dependency needs no lookup')
				)
			).length,
			2
		);
	}
});

test('publication rejects swapped identities and malformed dependency registry responses', async () => {
	const expected = new Map([['@exactjs/forms', '0.5.0']]);
	const archives = new Map([
		['@exactjs/forms', { manifest: { name: '@exactjs/core', version: '0.5.0' } }]
	]);
	await assert.rejects(
		planNpmPublication(expected, archives, () => false),
		/invalid release archive/
	);
	archives.get('@exactjs/forms').manifest = {
		name: '@exactjs/forms',
		version: '0.5.0',
		dependencies: { '@exactjs/core': '^0.5.0' }
	};
	await assert.rejects(
		planNpmPublication(
			expected,
			archives,
			() => false,
			() => ({ error: 'unavailable' })
		),
		/Invalid registry/
	);
	await assert.rejects(
		planNpmPublication(
			expected,
			archives,
			() => false,
			() => {
				throw new Error('network unavailable');
			}
		),
		/network unavailable/
	);
});
