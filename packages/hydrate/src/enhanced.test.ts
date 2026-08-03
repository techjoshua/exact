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
import { renderToString } from '@exactjs/ssr';
import { describe, expect, it } from 'vitest';
import { hydrate } from './enhanced.js';
import { createVNode } from './test-support/native-vnode.js';
import { noopLogger } from './test-support/responses.js';

describe('enhanced hydration facade', () => {
	it('supplies the application-bundle catalog after adoption', () => {
		const identity = '@exactjs/hydrate:enhanced-facade';
		const Enhancement = markExactComponent(function Enhancement(
			this: Component<{}>,
			props: { children?: Child }
		) {
			return () => createVNode('aside', { 'data-enhanced': true }, props.children);
		}, identity);
		const vnode = createVNode(
			'button',
			{ __exactEnhancements: createEnhancementMarker([{ identity, props: {} }]) },
			'Save'
		);
		const root = document.createElement('div');
		root.innerHTML = renderToString(vnode, {
			enhancementCatalog: new Map([[identity, Enhancement]])
		}).html;
		registerExactEnhancement(identity, Enhancement);

		hydrate(vnode, root, { logger: noopLogger });

		expect(root.innerHTML).toContain('<aside data-enhanced="true"><button>Save</button></aside>');
	});
});
