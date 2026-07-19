/**
 * @vitest-environment jsdom
 */
import { createContext, createPortal, createVNode, type Child, type Component } from '@exact/core';
import { jsx } from '@exact/jsx';
import { describe, expect, it } from 'vitest';
import { render, unmount } from './index.js';

describe('@exact/dom namespaces-portals', () => {
	it('renders portals in another container while preserving logical context and cleanup', () => {
		const container = document.createElement('div');
		const target = document.createElement('aside');
		const Message = createContext('default');
		let unmounted = false;
		let clicks = 0;

		function PortalChild(this: Component<Record<string, never>>) {
			const message = this.getContext(Message);
			this.onUnmount(() => {
				unmounted = true;
			});
			return () =>
				jsx('button', {
					onClick: () => {
						clicks++;
					},
					children: message as Child
				});
		}

		function App(this: Component<Record<string, never>>) {
			this.setContext(Message, 'through-portal');
			return () => createPortal(target, jsx(PortalChild, {}));
		}

		render(jsx(App, {}), container);
		expect(container.textContent).toBe('');
		expect(target.innerHTML).toBe('<button>through-portal</button>');
		target.querySelector('button')!.click();
		expect(clicks).toBe(1);

		unmount(container);
		expect(target.textContent).toBe('');
		expect(unmounted).toBe(true);
	});

	it('creates SVG and MathML descendants in their inherited namespaces', () => {
		const container = document.createElement('div');
		render(
			jsx('div', {
				children: [
					jsx('svg', { children: jsx('circle', { cx: 1 }) }),
					jsx('math', { children: jsx('mi', { children: 'x' }) })
				]
			}),
			container
		);
		expect(container.querySelector('circle')?.namespaceURI).toBe('http://www.w3.org/2000/svg');
		expect(container.querySelector('mi')?.namespaceURI).toBe('http://www.w3.org/1998/Math/MathML');
	});

	it('switches namespaces at SVG and MathML HTML integration points', () => {
		const container = document.createElement('div');
		render(
			createVNode(
				'div',
				null,
				createVNode(
					'svg',
					null,
					createVNode('foreignObject', null, createVNode('div', { id: 'svg-html' }))
				),
				createVNode(
					'math',
					null,
					createVNode('mtext', null, createVNode('span', { id: 'math-html' })),
					createVNode(
						'annotation-xml',
						{ encoding: 'text/html' },
						createVNode('section', { id: 'annotation-html' })
					)
				)
			),
			container
		);
		expect(container.querySelector('#svg-html')?.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
		expect(container.querySelector('#math-html')?.namespaceURI).toBe(
			'http://www.w3.org/1999/xhtml'
		);
		expect(container.querySelector('#annotation-html')?.namespaceURI).toBe(
			'http://www.w3.org/1999/xhtml'
		);
	});
});
