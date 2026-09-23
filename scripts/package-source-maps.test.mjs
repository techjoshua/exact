import assert from 'node:assert/strict';
import test from 'node:test';
import { missingPackagedMapSources } from './package-source-maps.mjs';

test('published maps require embedded sources or a shipped source file', () => {
	const files = new Set(['dist/index.js', 'dist/index.js.map']);
	assert.deepEqual(
		missingPackagedMapSources(
			'dist/index.js.map',
			{ sources: ['../src/index.ts'], sourcesContent: [''] },
			files
		),
		[]
	);
	assert.deepEqual(
		missingPackagedMapSources(
			'dist/index.js.map',
			{ sources: ['../src/index.ts'], sourcesContent: [null] },
			files
		),
		['../src/index.ts']
	);
	files.add('src/index.ts');
	assert.deepEqual(
		missingPackagedMapSources(
			'dist/index.js.map',
			{ sourceRoot: '../', sources: ['src/index.ts'] },
			files
		),
		[]
	);
});

test('malformed map sources fail instead of silently passing publication checks', () => {
	assert.throws(
		() => missingPackagedMapSources('dist/index.js.map', {}, new Set()),
		/Invalid source map/
	);
});
