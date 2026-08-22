/**
 * @vitest-environment jsdom
 */
import { Target, createVNode } from '@exactjs/core';
import { render } from '@exactjs/dom';
import '@exactjs/dom/runtime/target';
import { describe, expect, it } from 'vitest';
import { renderToString } from './index.js';

describe('DOM/SSR target contribution conformance', () => {
	it('merges ordered classes, styles, tokens, attributes, and content identically', () => {
		const vnode = createVNode(
			Target,
			{
				className: 'outer shared',
				style: { paddingTop: '4px' },
				'aria-describedby': 'outer shared'
			},
			createVNode(
				Target,
				{
					className: 'inner shared',
					style: { marginTop: '2px' },
					'aria-describedby': 'inner shared',
					'data-tone': 'inner'
				},
				createVNode(
					'button',
					{
						className: 'authored shared',
						style: { color: 'green' },
						'aria-describedby': 'authored shared'
					},
					'Save'
				)
			)
		);
		const container = document.createElement('div');
		render(vnode, container);
		const dom = container.firstElementChild!;
		const template = document.createElement('template');
		template.innerHTML = renderToString(vnode, { markers: false }).html;
		const ssr = template.content.firstElementChild!;

		expect(ssr.tagName).toBe(dom.tagName);
		expect(ssr.textContent).toBe(dom.textContent);
		expect(Object.fromEntries([...ssr.attributes].map(({ name, value }) => [name, value]))).toEqual(
			Object.fromEntries([...dom.attributes].map(({ name, value }) => [name, value]))
		);
	});
});
