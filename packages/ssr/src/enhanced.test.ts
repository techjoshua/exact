import {
	createEnhancementMarker,
	markExactComponent,
	type Child,
	type Component
} from '@exactjs/core';
import { registerExactEnhancement } from '@exactjs/core/framework/enhancement-catalog';
import { describe, expect, it } from 'vitest';
import { renderToString } from './enhanced.js';
import { createVNode } from './test-support/native-vnode.js';

describe('enhanced SSR facade', () => {
	it('supplies the application-bundle catalog by default', () => {
		const identity = '@exactjs/ssr:enhanced-facade';
		const Enhancement = markExactComponent(function Enhancement(
			this: Component<{}>,
			props: { children?: Child }
		) {
			return () => createVNode('aside', null, props.children);
		}, identity);
		registerExactEnhancement(identity, Enhancement);

		const output = renderToString(
			createVNode(
				'button',
				{ __exactEnhancements: createEnhancementMarker([{ identity, props: {} }]) },
				'Save'
			),
			{ markers: false }
		);

		expect(output.html).toBe('<aside><button>Save</button></aside>');
	});
});
