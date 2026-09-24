import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceDependencyGraph, validateDependencyCycles } from './source-dependencies.mjs';

test('rejects an accidental ownership cycle while ignoring type-only back references', () => {
	const sources = new Map([
		['packages/a/src/a.ts', "import {b} from './b.js';"],
		['packages/a/src/b.ts', "import type {A} from './a.js';"]
	]);
	validateDependencyCycles(sourceDependencyGraph(sources), []);
	sources.set('packages/a/src/b.ts', "export {a} from './a.js';");
	assert.throws(
		() => validateDependencyCycles(sourceDependencyGraph(sources), []),
		/Unreviewed cyclic/
	);
});

test('a reviewed recursive pair does not admit new cyclic edges or members', () => {
	const allowed = [
		{
			reason: 'Fixture recursion',
			edges: [
				['a', 'b'],
				['b', 'a']
			]
		}
	];
	validateDependencyCycles(
		new Map([
			['a', ['b']],
			['b', ['a']]
		]),
		allowed
	);
	assert.throws(
		() =>
			validateDependencyCycles(
				new Map([
					['a', ['b']],
					['b', ['a', 'c']],
					['c', ['a']]
				]),
				allowed
			),
		/b -> c/
	);
});

test('benchmark code consumes exported application APIs rather than framework internals', () => {
	const filename = 'framework-comparison/participants/exact/src/server.ts';
	sourceDependencyGraph(new Map([[filename, "import {render} from '@exactjs/ssr';"]]));
	for (const specifier of [
		'@exactjs/server/framework/render-scheduling',
		'../../../../packages/server/src/response-body.ts',
		'@exactjs/ssr/dist/index.js'
	]) {
		assert.throws(
			() => sourceDependencyGraph(new Map([[filename, `import {x} from '${specifier}';`]])),
			/public framework APIs/
		);
	}
});
