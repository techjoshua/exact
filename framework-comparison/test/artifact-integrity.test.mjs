import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import test from 'node:test';

import { hashArtifactDirectory, hashSemanticResponse } from '../src/artifact-integrity.mjs';

test('artifact identity includes ordered relative paths and bytes', async () => {
	const root = await mkdtemp(resolve(tmpdir(), 'exact-artifact-integrity-'));
	try {
		await mkdir(resolve(root, 'nested'));
		await writeFile(resolve(root, 'a.js'), 'one');
		await writeFile(resolve(root, 'nested', 'b.js'), 'two');
		const first = await hashArtifactDirectory(root);
		assert.equal(first, await hashArtifactDirectory(root));
		await writeFile(resolve(root, 'nested', 'b.js'), 'three');
		assert.notEqual(first, await hashArtifactDirectory(root));
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('semantic response identity is stable for the participant-neutral contract', () => {
	assert.equal(
		hashSemanticResponse({ owner: 'Alex Chen', version: 'Version 2' }),
		hashSemanticResponse({ owner: 'Alex Chen', version: 'Version 2' })
	);
});
