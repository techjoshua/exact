/**
 * @vitest-environment jsdom
 */
import '@exactjs/core/runtime/refs';
import { Accessibility } from '@exactjs/accessibility';
import { createEnhancementNode, createRef, type Component } from '@exactjs/core';
import { createExactFrameworkFixtureArtifact } from '@exactjs/core/framework/component-contracts';
import { renderToString } from '@exactjs/ssr';
import { describe, expect, it } from 'vitest';
import { hydrate } from './index.js';
import { createVNode } from './test-support/native-vnode.js';
import { noopLogger } from './test-support/responses.js';

const labelKey = createRef<HTMLSpanElement>('hydrated accessibility label');
const identity = '@exactjs/accessibility/enhancements#labelledBy';

describe('@exactjs/hydrate accessibility identity adoption', () => {
	it('retains the server relationship and generated target ID while adopting nodes', () => {
		const Page = createExactFrameworkFixtureArtifact(function Page(this: Component<{}>) {
			const label = this.ref(labelKey);
			return () => [
				createVNode('span', { ref: label }, 'Account email'),
				createVNode('input', {
					__exactEnhancements: createEnhancementNode([{ identity, props: { labelledBy: label } }])
				})
			];
		}, '@exactjs/hydrate:accessibility-page');
		const enhancementCatalog = new Map([[identity, Accessibility]]);
		const vnode = createVNode(Page, null);
		const container = document.createElement('div');
		container.innerHTML = renderToString(vnode, {
			markers: false,
			enhancementCatalog
		}).html;
		const serverLabel = container.querySelector('span')!;
		const serverInput = container.querySelector('input')!;
		const id = serverLabel.id;

		hydrate(vnode, container, {
			allowMarkerless: true,
			enhancementCatalog,
			logger: noopLogger
		});

		expect(container.querySelector('span')).toBe(serverLabel);
		expect(container.querySelector('input')).toBe(serverInput);
		expect(container.querySelector('span')?.id).toBe(id);
		expect(container.querySelector('input')?.getAttribute('aria-labelledby')).toBe(id);
		expect(serverInput.getAttribute('aria-labelledby')).toBe(id);
	});
});
