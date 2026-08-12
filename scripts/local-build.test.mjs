import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

test('the root build prepares package-export prerequisites before building dependent workspaces', async () => {
	const manifest = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'));

	assert.equal(
		manifest.scripts.build,
		'npm run build:prerequisites && npm run build:native-compiler && npm run build:workspaces'
	);
	assert.equal(
		manifest.scripts['build:prerequisites'],
		'npm run build -w @exactjs/core -w @exactjs/jsx -w @exactjs/intl-analyzer'
	);
	assert.equal(
		manifest.scripts['build:workspaces'],
		'npm run generate:app-artifacts && tsc6 -b && npm run typecheck -w @exactjs/sample-puzzle-generator'
	);
	assert.equal(manifest.devDependencies['@typescript/native'], 'npm:typescript@^7.0.2');
});

test('the root build includes the enhancement playground and its component libraries', async () => {
	const config = JSON.parse(await readFile(path.resolve('tsconfig.json'), 'utf8'));
	const references = new Set(config.references.map((reference) => reference.path));

	for (const project of [
		'./component-libraries/physics',
		'./component-libraries/gravity',
		'./apps/enhancement-playground'
	]) {
		assert.ok(references.has(project), `missing root TypeScript project reference: ${project}`);
	}
});
