/**
 * @vitest-environment jsdom
 */
import { createContext, createPortal, type Child, type Component } from '@exactjs/core';
import { createCompiledChildRangeReceipt } from '@exactjs/core/runtime/render-operations';
import { createOperation, jsx } from './test-support/native-operations.js';
import { batch, computed, flushSync, reactive } from '@exactjs/reactive';
import { describe, expect, it, onTestFinished } from 'vitest';
import { namespaceForTag } from './namespace.js';
import { unmount } from './index.js';
import { renderTestTree as render } from './testing.js';

describe('@exactjs/dom namespaces-portals', () => {
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

	it.each(['text/html', 'application/xhtml+xml', 'application/xml'])(
		'resolves reactive annotation encoding before creating children (%s)',
		(encoding) => {
			const container = document.createElement('div');
			onTestFinished(() => {
				unmount(container);
			});
			render(
				createOperation(
					'math',
					null,
					createOperation(
						'annotation-xml',
						{ encoding: computed(() => encoding) },
						createOperation('span', { id: 'child' })
					)
				),
				container
			);
			expect(container.querySelector('#child')?.namespaceURI).toBe(
				encoding === 'application/xml'
					? 'http://www.w3.org/1998/Math/MathML'
					: 'http://www.w3.org/1999/xhtml'
			);
			unmount(container);
			expect(container.childNodes).toHaveLength(0);
		}
	);

	it.each([
		'binding/encoding-first',
		'binding/children-first',
		'receipt/encoding-first',
		'receipt/children-first'
	])('uses current annotation encoding when a range appears (%s)', (order) => {
		const container = document.createElement('div');
		onTestFinished(() => {
			unmount(container);
		});
		const state = reactive<{ encoding: string | undefined; visible: boolean }>({
			encoding: 'application/xml',
			visible: false
		});
		const children = () =>
			state.visible ? createOperation('span', { id: 'changing-child' }) : null;
		const annotation = order.startsWith('binding')
			? createOperation(
					'annotation-xml',
					{ encoding: computed(() => state.encoding) },
					createCompiledChildRangeReceipt(children)
				)
			: createCompiledChildRangeReceipt(() =>
					createOperation(
						'annotation-xml',
						state.encoding === undefined ? {} : { encoding: state.encoding },
						children()
					)
				);
		render(createOperation('math', null, annotation), container);
		const retained = container.querySelector('annotation-xml')!;

		for (const encoding of ['application/xhtml+xml', undefined, 'text/html', 'application/xml']) {
			batch(() => {
				if (order.endsWith('encoding-first')) {
					state.encoding = encoding;
					state.visible = true;
				} else {
					state.visible = true;
					state.encoding = encoding;
				}
			});
			flushSync();
			expect(container.querySelector('#changing-child')?.namespaceURI).toBe(
				encoding === 'text/html' || encoding === 'application/xhtml+xml'
					? 'http://www.w3.org/1999/xhtml'
					: 'http://www.w3.org/1998/Math/MathML'
			);
			state.visible = false;
			flushSync();
			expect(container.querySelector('#changing-child')).toBeNull();
		}
		expect(container.querySelector('annotation-xml')).toBe(retained);
		unmount(container);
		expect(container.childNodes).toHaveLength(0);
		state.encoding = 'text/html';
		flushSync();
		expect(namespaceForTag('span', retained)).toBe('http://www.w3.org/1998/Math/MathML');
	});

	it('switches namespaces at SVG and MathML HTML integration points', () => {
		const container = document.createElement('div');
		render(
			createOperation(
				'div',
				null,
				createOperation(
					'svg',
					null,
					createOperation('foreignObject', null, createOperation('div', { id: 'svg-html' }))
				),
				createOperation(
					'math',
					null,
					createOperation('mtext', null, createOperation('span', { id: 'math-html' })),
					createOperation(
						'annotation-xml',
						{ encoding: 'text/html' },
						createOperation('section', { id: 'annotation-html' })
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
import '@exactjs/core/runtime/contexts';
