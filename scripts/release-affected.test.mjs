import assert from 'node:assert/strict';
import test from 'node:test';

import { compilerAcceptanceAffected } from './release-affected.mjs';

test('compiler acceptance follows compiler and bundler-assembly changes', () => {
	for (const filename of [
		'native/typescript-go/overlay/internal/exactcompiler/compiler.go',
		'packages/compiler/src/index.ts',
		'packages/expressions/src/index.ts',
		'packages/plugin-api/src/index.ts',
		'packages/plugin-host/src/index.ts',
		'framework-adapters/vite-plugin/src/index.ts',
		'framework-adapters/webpack-plugin/src/index.ts',
		'framework-adapters/bun-plugin/src/index.ts',
		'scripts/check-compiler-acceptance.mjs',
		'scripts/start-vite-acceptance-server.mjs'
	]) {
		assert.equal(compilerAcceptanceAffected([filename]), true, filename);
	}
});

test('compiler acceptance ignores ordinary application and runtime changes', () => {
	assert.equal(
		compilerAcceptanceAffected([
			'apps/docs/src/CodeBlock.tsx',
			'apps/sudoku/src/SudokuApp.tsx',
			'packages/core/src/component.ts'
		]),
		false
	);
});
