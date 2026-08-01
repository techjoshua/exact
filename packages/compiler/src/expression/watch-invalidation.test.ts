import { describe, expect, it } from 'vitest';
import { classifyExactWatchInvalidation } from './watch-invalidation.js';

describe('compiler watch invalidation classification', () => {
	it.each([
		'/app/src/view.tsx',
		'/app/src/model.ts',
		'/app/src/types.d.ts',
		'/app/src/worker.mts',
		'/app/src/config.cts',
		'/app/src/legacy.jsx',
		'/app/src/module.mjs?direct',
		'C:\\app\\src\\module.cjs'
	])('diagnoses source file %s incrementally', (filename) => {
		expect(classifyExactWatchInvalidation(filename)).toBe('source');
	});

	it.each([
		'/app/tsconfig.json',
		'/app/tsconfig.client.json',
		'/app/jsconfig.json',
		'/app/package.json',
		'/app/src/fixtures/data.JSON'
	])('resets the project for configuration or JSON module %s', (filename) => {
		expect(classifyExactWatchInvalidation(filename)).toBe('project');
	});

	it.each([
		'/app/src/styles.css',
		'/app/public/analysis.webmanifest',
		'/app/tsconfig.tsbuildinfo',
		'/app/dist/icon.svg',
		'/app/dist/image.png',
		'/app/.standalone-build/index.html'
	])('ignores non-program watcher file %s', (filename) => {
		expect(classifyExactWatchInvalidation(filename)).toBe('ignore');
	});
});
