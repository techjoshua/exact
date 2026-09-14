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
