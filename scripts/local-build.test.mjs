import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('the root build prepares core before testing the native compiler', async () => {
	const manifest = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'));

	assert.equal(
		manifest.scripts.build,
		'npm run build:prerequisites && npm run build:native-compiler && npm run build:workspaces'
	);
	assert.equal(manifest.scripts['build:prerequisites'], 'npm run build -w @exactjs/core');
	assert.equal(manifest.scripts['build:workspaces'], 'npm run generate:app-artifacts && tsc6 -b');
});
