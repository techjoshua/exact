/** @vitest-environment jsdom */
import { flushSync, reactive } from '@exactjs/reactive';
import { expect, it } from 'vitest';
import { unmount } from './index.js';
import { renderTestTree } from './testing.js';
import { createTestCompiledRenderProgram } from './test-support/render-program.js';

it('observes generic spread field changes, key removal, restoration and disposal', () => {
	const bag = reactive<{ title?: string; id?: string }>({ title: 'first' });
	const program = createTestCompiledRenderProgram(
		'generic-spread-observation',
		() => ({
			version: 2,
			id: 'generic-spread-observation',
			namespace: 'html',
			template: '<div></div>',
			nodes: [[0, 'div']],
			slots: [['spread', 0]],
			bindings: [['properties', [0]]]
		}),
		[() => bag]
	);
	const host = document.createElement('div');
	try {
		renderTestTree(program, host);
		const element = host.querySelector('div')!;
		expect(element.title).toBe('first');
		bag.title = 'updated';
		bag.id = 'added';
		flushSync();
		expect(host.querySelector('div')).toBe(element);
		expect(element.title).toBe('updated');
		expect(element.id).toBe('added');
		delete bag.title;
		flushSync();
		expect(element.hasAttribute('title')).toBe(false);
		bag.title = 'restored';
		flushSync();
		expect(element.title).toBe('restored');
		unmount(host);
		bag.title = 'disposed';
		flushSync();
		expect(element.title).toBe('restored');
		expect(host.childNodes).toHaveLength(0);
	} finally {
		unmount(host);
	}
});
