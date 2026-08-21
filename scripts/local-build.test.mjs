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
		'npm run generate:app-artifacts && tsc6 -b && node scripts/compile-exact-package.mjs packages/request && node scripts/compile-exact-package.mjs packages/accessibility && node scripts/compile-exact-package.mjs packages/intl && node scripts/compile-exact-package.mjs packages/time && node scripts/compile-exact-package.mjs packages/theme && node scripts/compile-exact-package.mjs component-libraries/app-theme-preference && npm run build:chromium-devtools && npm run generate:component-library-build-facts && npm run typecheck -w @exactjs/sample-puzzle-generator'
	);
	assert.equal(
		manifest.scripts['build:chromium-devtools'],
		'node packages/chromium-devtools/build.mjs'
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

test('shipping artifact generation builds the theme metadata it consumes', async () => {
	const manifest = JSON.parse(
		await readFile(path.resolve('apps/shipping-calculator/package.json'), 'utf8')
	);

	assert.equal(
		manifest.scripts.pregenerate,
		'npm run build -w @exactjs/compiler && npm run build -w @exactjs/theme'
	);
});

test('the Bun plugin builds its production microfrontend dependency from a clean checkout', async () => {
	const config = JSON.parse(
		await readFile(path.resolve('framework-adapters/bun-plugin/tsconfig.json'), 'utf8')
	);
	const references = new Set(config.references.map((reference) => reference.path));

	assert.ok(
		references.has('../../plugins/microfrontends'),
		'missing Bun plugin TypeScript reference for @exactjs/microfrontends'
	);
});

test('machine-specific native corpus timing remains an explicit local diagnostic', async () => {
	const workflow = await readFile(
		path.resolve('.github/workflows/native-compiler-packages.yml'),
		'utf8'
	);
	const releaseCheck = await readFile(path.resolve('scripts/release-check.mjs'), 'utf8');

	assert.doesNotMatch(workflow, /check:native-compiler-corpus/);
	assert.doesNotMatch(releaseCheck, /check:native-compiler-corpus/);
});

test('Pages publishes Puzzle Foundry without advertising its hosted entry point', async () => {
	const workflow = await readFile(
		path.resolve('.github/workflows/native-compiler-packages.yml'),
		'utf8'
	);
	const assembler = await readFile(path.resolve('scripts/prepare-gh-pages.mjs'), 'utf8');
	const samplesReference = await readFile(path.resolve('docs/sample-applications.md'), 'utf8');
	const samplesPage = await readFile(path.resolve('apps/docs/src/pages/SamplesPage.tsx'), 'utf8');

	assert.match(workflow, /npm run build:puzzle-generator:standalone/);
	assert.match(assembler, /puzzle-foundry\.html/);
	assert.match(samplesReference, /intentionally unadvertised `puzzle-foundry\.html`/);
	assert.doesNotMatch(samplesPage, /puzzle-foundry\.html/);
	assert.doesNotMatch(samplesPage, /Puzzle Foundry/);
});
