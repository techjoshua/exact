/**
 * @vitest-environment jsdom
 */
import './framework/enhancements.js';
import { Accessibility } from '@exactjs/accessibility';
import {
	createEnhancementMarker,
	createRef,
	markExactComponent,
	type Component
} from '@exactjs/core';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { render } from './index.js';
import { createVNode } from './test-support/native-vnode.js';

const helpKey = createRef<HTMLSpanElement>('accessibility DOM help');
const identity = '@exactjs/accessibility/enhancements#describedBy';

describe('@exactjs/dom accessibility enhancement integration', () => {
	it('publishes a ref relationship without wrapper markup and keeps generated identity', () => {
		const Page = markExactComponent(function Page(this: Component<{}>) {
			const help = this.ref(helpKey);
			return () => [
				createVNode(
					'button',
					{
						__exactEnhancements: createEnhancementMarker([
							{ identity, props: { describedBy: help } }
						])
					},
					'Delete'
				),
				createVNode('span', { ref: help }, 'Cannot be undone')
			];
		}, '@exactjs/dom:accessibility-page');
		const container = document.createElement('div');

		render(createVNode(Page, null), container, {
			enhancementCatalog: new Map([[identity, Accessibility]])
		});
		flushSync();
		const button = container.querySelector('button')!;
		const help = container.querySelector('span')!;
		expect(button.getAttribute('aria-describedby')).toBe(help.id);
		expect(help.id).toMatch(/^exact-/u);
		expect(container.children).toHaveLength(2);
	});
});
