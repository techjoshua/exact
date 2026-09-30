/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { collectAuthoredChildren } from './framework-ranges.js';

it.each([
	['no markers', 'a<span>b</span>c', 'abc', false],
	[
		'complete range',
		'a<!--exact:framework-head:start-->hidden<!--exact:framework-head:end-->b',
		'ab',
		true
	],
	[
		'multiple ranges',
		'a<!--exact:framework-head:start-->one<!--exact:framework-head:end-->b<!--exact:framework-body:start-->two<!--exact:framework-body:end-->c',
		'abc',
		true
	],
	[
		'unmatched first opening',
		'a<!--exact:framework-head:start-->b<!--exact:framework-body:start-->c<!--exact:framework-body:end-->d',
		'abcd',
		false
	],
	[
		'interrupted range',
		'a<!--exact:framework-head:start-->b<!--exact:framework-body:start-->c<!--exact:framework-body:end-->d<!--exact:framework-head:end-->e',
		'abde',
		true
	],
	[
		'unexpected framework marker',
		'a<!--exact:framework-head:start-->b<!--exact:framework-head:other-->c<!--exact:framework-head:end-->d',
		'abcd',
		true
	]
])('preserves authored siblings for %s', (_name, markup, text, paired) => {
	const parent = document.createElement('div');
	parent.innerHTML = markup as string;
	const original = parent.innerHTML;
	const result = collectAuthoredChildren(parent);
	expect(result.framework !== undefined).toBe(paired);
	expect(
		result.nodes
			.filter((node) => node.nodeType !== Node.COMMENT_NODE)
			.map((node) => node.textContent)
			.join('')
	).toBe(text);
	expect(parent.innerHTML).toBe(original);
});
