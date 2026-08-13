import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { extensionBundleOptions } from '../packages/vscode-extension/scripts/bundle.mjs';

test('the VS Code client bundles runtime dependencies under the extension path', () => {
	const options = extensionBundleOptions();

	assert.equal(options.bundle, true);
	assert.deepEqual(options.entryPoints, [
		path.resolve('packages/vscode-extension/src/extension.ts')
	]);
	assert.equal(options.outfile, path.resolve('packages/vscode-extension/dist/extension.js'));
	assert.deepEqual(options.external, ['vscode']);
	assert.equal(options.format, 'esm');
	assert.equal(options.platform, 'node');
	assert.match(options.banner.js, /__exactCreateRequire\(import\.meta\.url\)/);
	assert.equal(options.absWorkingDir, path.resolve('packages/vscode-extension'));
});

test('the VS Code manifest uses valid semantic-token modifier identifiers', async () => {
	const manifest = JSON.parse(await readFile('packages/vscode-extension/package.json', 'utf8'));
	for (const modifier of manifest.contributes.semanticTokenModifiers)
		assert.match(modifier.id, /^[A-Za-z0-9][-_A-Za-z0-9]*$/u);
});
