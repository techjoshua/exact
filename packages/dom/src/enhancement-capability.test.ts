/**
 * @vitest-environment jsdom
 */
import {
	createEnhancementMarker,
	markExactComponent,
	type Child,
	type Component
} from '@exactjs/core';
import { registerExactEnhancement } from '@exactjs/core/framework/enhancement-catalog';
import { describe, expect, it } from 'vitest';
import {
	domEnhancementCapability,
	registerDomEnhancementCapability
} from './renderer/enhancement-capability.js';
import { render } from './renderer/root-lifecycle.js';
import { createVNode } from './test-support/native-vnode.js';

describe('DOM enhancement capability activation', () => {
	it('activates from a later-loaded module after the renderer root already exists', async () => {
		const container = document.createElement('div');
		render(createVNode('p', null, 'Before'), container);
		expect(container.innerHTML).toBe('<p>Before</p>');
		expect(domEnhancementCapability()).toBeUndefined();

		await import('./framework/enhancements.js');
		const identity = '@exactjs/dom:late-enhancement-capability';
		const Enhancement = markExactComponent(function Enhancement(
			this: Component<{}>,
			props: { children?: Child }
		) {
			return () => createVNode('aside', { 'data-late': true }, props.children);
		}, identity);
		registerExactEnhancement(identity, Enhancement);

		render(
			createVNode(
				'button',
				{ __exactEnhancements: createEnhancementMarker([{ identity, props: {} }]) },
				'After'
			),
			container
		);

		expect(container.innerHTML).toBe('<aside data-late="true"><button>After</button></aside>');

		const installed = domEnhancementCapability();
		registerDomEnhancementCapability({
			abi: 1,
			install: () => undefined,
			activate: (_root, mounted) => mounted,
			patch: (_root, mounted) => mounted
		});
		expect(domEnhancementCapability()).toBe(installed);
	});
});
