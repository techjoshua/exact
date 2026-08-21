/**
 * @vitest-environment jsdom
 */
import { createEnhancementMarker, type Child, type Component } from '@exactjs/core';
import { createExactFrameworkFixtureArtifact } from '@exactjs/core/framework/component-contracts';
import { registerExactEnhancement } from '@exactjs/core/framework/enhancement-catalog';
import { describe, expect, it } from 'vitest';
import { render } from './enhanced.js';
import { createVNode } from './test-support/native-vnode.js';

describe('enhanced DOM facade', () => {
	it('supplies the application-bundle catalog by default', () => {
		const identity = '@exactjs/dom:enhanced-facade';
		const Enhancement = createExactFrameworkFixtureArtifact(function Enhancement(
			this: Component<{}>,
			props: { children?: Child }
		) {
			return () => createVNode('aside', null, props.children);
		}, identity);
		registerExactEnhancement(identity, Enhancement);
		const container = document.createElement('div');

		render(
			createVNode(
				'button',
				{ __exactEnhancements: createEnhancementMarker([{ identity, props: {} }]) },
				'Save'
			),
			container
		);

		expect(container.innerHTML).toBe('<aside><button>Save</button></aside>');
	});
});
