import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, rm, symlink, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { assertReleaseOutput } from './release-output-path.mjs';

test('release output rejects escapes, junction ancestors and files before deletion', async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'exact-release-path-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const temporary = path.join(root, '.tmp');
	await mkdir(temporary);
	const outside = path.join(root, 'valuable');
	await mkdir(outside);
	await writeFile(path.join(outside, 'sentinel'), 'preserve');
	await symlink(
		outside,
		path.join(temporary, 'redirect'),
		process.platform === 'win32' ? 'junction' : 'dir'
	);
	await writeFile(path.join(temporary, 'file'), 'preserve');
	for (const output of [
		temporary,
		outside,
		path.join(temporary, 'redirect', 'release'),
		path.join(temporary, 'file')
	])
		await assert.rejects(assertReleaseOutput(root, output));
	await assertReleaseOutput(root, path.join(temporary, 'new', 'release'));
	assert.equal(await readFile(path.join(outside, 'sentinel'), 'utf8'), 'preserve');
});

test('release output preserves native inputs beneath dot-prefixed children and external aliases', async (t) => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'exact-native-release-path-'));
	t.after(() => rm(root, { recursive: true, force: true }));
	const output = path.join(root, '.tmp', 'release');
	const nested = path.join(output, '..archives');
	await mkdir(nested, { recursive: true });
	await writeFile(path.join(nested, 'native.tgz'), 'preserve');
	const alias = path.join(root, 'native-alias');
	await symlink(nested, alias, process.platform === 'win32' ? 'junction' : 'dir');
	for (const input of [nested, output, alias])
		await assert.rejects(assertReleaseOutput(root, output, [input]), /Native input archives/);
	const sibling = path.join(root, '.tmp', 'release-archives');
	await mkdir(sibling);
	await assertReleaseOutput(root, output, [sibling]);
	assert.equal(await readFile(path.join(nested, 'native.tgz'), 'utf8'), 'preserve');
});
