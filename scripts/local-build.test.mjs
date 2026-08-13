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
		'npm run generate:app-artifacts && tsc6 -b && npm run generate:component-library-build-facts && npm run typecheck -w @exactjs/sample-puzzle-generator'
	);
	assert.equal(
		manifest.scripts['generate:component-library-build-facts'],
		'node scripts/generate-all-component-library-build-facts.mjs'
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

test('Pages publishes Puzzle Foundry without advertising it in documentation', async () => {
	const workflow = await readFile(
		path.resolve('.github/workflows/native-compiler-packages.yml'),
		'utf8'
	);
	const assembler = await readFile(path.resolve('scripts/prepare-gh-pages.mjs'), 'utf8');
	const documentationSources = await Promise.all(
		[
			'README.md',
			'docs/sample-applications.md',
			'apps/docs/src/docs-manifest.ts',
			'apps/docs/src/pages/SamplesPage.tsx'
		].map((filename) => readFile(path.resolve(filename), 'utf8'))
	);

	assert.match(workflow, /npm run build:puzzle-generator:standalone/);
	assert.match(assembler, /puzzle-foundry\.html/);
	for (const source of documentationSources) {
		assert.doesNotMatch(source, /Puzzle Foundry|puzzle-foundry\.html|apps\/puzzle-generator/);
	}
});
