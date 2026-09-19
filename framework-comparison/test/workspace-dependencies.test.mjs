import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertComparisonWorkspaceDependencies } from '../src/workspace-dependencies.mjs';

async function fixture(t, shadow) {
	const root = await mkdtemp(join(tmpdir(), 'exact-comparison-resolution-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	await mkdir(join(root, 'framework-adapters'));
	const workspace = join(root, 'packages/core');
	await mkdir(workspace, { recursive: true });
	const metadata = { name: '@exactjs/core', version: '0.6.0', main: 'index.js' };
	await writeFile(join(workspace, 'package.json'), JSON.stringify(metadata));
	await writeFile(join(workspace, 'index.js'), '');
	await mkdir(join(root, 'node_modules/@exactjs'), { recursive: true });
	await symlink(workspace, join(root, 'node_modules/@exactjs/core'), 'junction');
	const suite = join(root, 'framework-comparison');
	await mkdir(suite);
	await writeFile(
		join(suite, 'package.json'),
		JSON.stringify({ dependencies: { '@exactjs/core': '^0.6.0' } })
	);
	if (shadow) {
		const nested = join(suite, shadow, 'node_modules/@exactjs/core');
		await mkdir(nested, { recursive: true });
		await writeFile(join(nested, 'package.json'), JSON.stringify(metadata));
		await writeFile(join(nested, 'index.js'), '');
	}
	return root;
}

test('records workspace identity from build, runtime, and native participant origins', async (t) => {
	const records = assertComparisonWorkspaceDependencies(await fixture(t));
	assert.equal(records.length, 6);
	assert.ok(
		records.every((entry) => entry.version === '0.6.0' && entry.entry.endsWith('core/index.js'))
	);
});

for (const location of ['.', 'participants/exact', 'participants/exact-native'])
	test(`rejects a same-version registry copy shadowing the workspace at ${location}`, async (t) => {
		const root = await fixture(t, location);
		assert.throws(() => assertComparisonWorkspaceDependencies(root), /outside its workspace/);
	});
