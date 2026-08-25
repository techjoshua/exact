import { Accessibility } from '@exactjs/accessibility';
import { createEnhancementNode, createRef, type Component } from '@exactjs/core';
import '@exactjs/core/runtime/refs';
import { createExactFrameworkFixtureArtifact } from '@exactjs/core/framework/component-contracts';
import { describe, expect, it } from 'vitest';
import { renderToString } from './index.js';
import { createVNode } from './test-support/native-vnode.js';

const helpKey = createRef<HTMLSpanElement>('accessibility SSR help');
const identity = '@exactjs/accessibility/enhancements#describedBy';

describe('@exactjs/ssr accessibility enhancement integration', () => {
	it('reserves one relationship identity before either intrinsic serializes', () => {
		const Page = createExactFrameworkFixtureArtifact(function Page(this: Component<{}>) {
			const help = this.ref(helpKey);
			return () => [
				createVNode(
					'button',
					{
						__exactEnhancements: createEnhancementNode([{ identity, props: { describedBy: help } }])
					},
					'Delete'
				),
				createVNode('span', { ref: help }, 'Cannot be undone')
			];
		}, '@exactjs/ssr:accessibility-page');

		const html = renderToString(createVNode(Page, null), {
			markers: false,
			enhancementCatalog: new Map([[identity, Accessibility]])
		}).html;
		const relationship = /aria-describedby="([^"]+)"/u.exec(html)?.[1];
		expect(relationship).toMatch(/^exact-/u);
		expect(html).toContain(`<span id="${relationship}">Cannot be undone</span>`);
	});
});
