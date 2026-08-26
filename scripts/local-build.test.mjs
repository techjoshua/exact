import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
	exactCompileWorkspaces,
	orderExactCompileWorkspaces
} from './exact-package-build-plan.mjs';

test('the root build prepares package-export prerequisites before building dependent workspaces', async () => {
	const manifest = JSON.parse(await readFile(path.resolve('package.json'), 'utf8'));

	assert.equal(
		manifest.scripts.build,
		'npm run generate:compiler-abi && npm run build:prerequisites && npm run build:native-compiler && npm run build:workspaces'
	);
	assert.equal(manifest.scripts['generate:compiler-abi'], 'node scripts/generate-compiler-abi.mjs');
	assert.equal(
		manifest.scripts['build:prerequisites'],
		'npm run build -w @exactjs/core -w @exactjs/jsx -w @exactjs/intl-analyzer -w @exactjs/dom -w @exactjs/ssr'
	);
	assert.equal(
		manifest.scripts['build:bun-prerequisites'],
		'npm run build -w @exactjs/compiler && npm run build -w @exactjs/request && npm run build -w @exactjs/intl && npm run build -w @exactjs/testing && npm run build -w @exactjs/microfrontends'
	);
	assert.match(manifest.scripts['test:bun'], /^npm run build:bun-prerequisites && /);
	assert.equal(
		manifest.scripts['build:workspaces'],
		'npm run generate:app-artifacts && tsc6 -b && node scripts/compile-all-exact-packages.mjs && npm run build:chromium-devtools && npm run typecheck -w @exactjs/sample-puzzle-generator'
	);
	assert.equal(
		manifest.scripts['build:chromium-devtools'],
		'node packages/chromium-devtools/build.mjs'
	);
	assert.equal(manifest.scripts['generate:component-library-build-facts'], undefined);
	assert.equal(manifest.devDependencies['@typescript/native'], 'npm:typescript@^7.0.2');
});

test('target-local package compilation includes private application component libraries', async () => {
	const workspaces = await exactCompileWorkspaces(path.resolve('.'));
	const names = workspaces.map((entry) => entry.manifest.name);

	assert.ok(names.length > 0);
	assert.ok(names.includes('@exactjs/app-theme-preference'));
	assert.ok(names.includes('@exactjs/request'));
	assert.ok(names.includes('@exactjs/router'));
	assert.ok(names.includes('@exactjs/microfrontends'));
	assert.equal(new Set(names).size, names.length);
	assert.ok(
		names.indexOf('@exactjs/physics') < names.indexOf('@exactjs/gravity'),
		'compiled dependencies must precede their consumers'
	);
});

test('target-local package compilation preserves intentionally exported fixture support', async () => {
	const manifest = JSON.parse(
		await readFile(path.resolve('packages/testing/package.json'), 'utf8')
	);
	const compiler = await readFile(path.resolve('scripts/compile-exact-package.mjs'), 'utf8');

	assert.ok(manifest.exports['./internal/fixtures']);
	assert.doesNotMatch(manifest.files.join('\n'), /^!.*\.fixtures\./m);
	assert.match(compiler, /excludesFixtureArtifacts/);
	assert.match(compiler, /isUnpublishedSupportArtifact/);
});

test('target-local package compilation rejects dependency cycles', () => {
	const workspace = (name, dependencies) => ({ manifest: { name, dependencies } });
	assert.throws(
		() =>
			orderExactCompileWorkspaces([
				workspace('@exactjs/left', { '@exactjs/right': '^0.1.0' }),
				workspace('@exactjs/right', { '@exactjs/left': '^0.1.0' })
			]),
		/Cyclic eXact package compilation dependencies: @exactjs\/left, @exactjs\/right/
	);
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

test('shipping artifact generation builds the target artifacts it consumes', async () => {
	const manifest = JSON.parse(
		await readFile(path.resolve('apps/shipping-calculator/package.json'), 'utf8')
	);

	assert.equal(
		manifest.scripts.pregenerate,
		'npm run build -w @exactjs/compiler && npm run build -w @exactjs/request && npm run build -w @exactjs/theme'
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
