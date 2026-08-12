/**
 * @vitest-environment jsdom
 */
import {
	createCompiledRenderProgram,
	createCompiledVNode,
	createDynamicChild,
	markExactComponent,
	type Component
} from '@exactjs/core';
import { renderToString } from '@exactjs/ssr';
import { describe, expect, it, vi } from 'vitest';
import { hydrate, hydrateAfterNavigation } from './root.js';
import { createVNode } from './test-support/native-vnode.js';

describe('hydration-only root capability', () => {
	it('activates synchronously when interaction precedes deferred navigation hydration', async () => {
		vi.useFakeTimers();
		try {
			const vnode = createVNode('button', { onClick: () => undefined }, 'Ready');
			const container = document.createElement('main');
			container.innerHTML = renderToString(vnode).html;
			const pending = hydrateAfterNavigation(vnode, container);

			container
				.querySelector('button')!
				.dispatchEvent(new Event('pointerdown', { bubbles: true }));

			const root = await pending;
			expect(container.dataset.exactHydrated).toBe('true');
			root.dispose();
		} finally {
			vi.useRealTimers();
		}
	});

	it('adopts marked compiler render programs without materializing their generic cells', () => {
		let fallbacks = 0;
		const program = createCompiledRenderProgram(
			'root-marked-program',
			() => ({
				version: 1,
				id: 'root-marked-program',
				namespace: 'html',
				template: '<span data-exact-id="program-root">\ue000exact:0\ue001</span>',
				parts: ['<span data-exact-id="program-root">', '</span>'],
				slots: [{ id: 'program-text', kind: 'text', path: [0] }],
				nodes: [{ id: 'program-root', path: [], tag: 'span', namespace: 'html' }],
				ssrParts: ['', '<span data-exact-id="program-root">', '', '</span>', ''],
				ssrOperations: [
					{ kind: 'node-open', index: 0 },
					{ kind: 'slot', index: 0 },
					{ kind: 'node-close', index: 0 }
				]
			}),
			[() => 'ready'],
			() => {
				fallbacks++;
				return createCompiledVNode(
					'span',
					{ 'data-exact-id': 'program-root' },
					createDynamicChild(() => 'ready', 'program-text')
				);
			}
		);
		const container = document.createElement('main');
		container.innerHTML = renderToString(program).html;
		const span = container.querySelector('span');
		const fallbackCount = fallbacks;

		const root = hydrate(program, container);

		expect(container.querySelector('span')).toBe(span);
		expect(fallbacks).toBe(fallbackCount);
		root.dispose();
	});

	it('adopts and owns SSR DOM without exposing optional request methods', () => {
		const App = markExactComponent(function App(this: Component<{}>) {
			return () => createVNode('p', { id: 'message' }, 'ready');
		}, '@exactjs/hydrate:root-only-test');
		const vnode = createVNode(App, null);
		const container = document.createElement('main');
		container.innerHTML = renderToString(vnode).html;
		const paragraph = container.querySelector('p');

		const root = hydrate(vnode, container);

		expect(container.querySelector('p')).toBe(paragraph);
		expect('invokeTask' in root).toBe(false);
		expect(container.dataset.exactHydrated).toBe('true');
		root.dispose();
		expect(container.dataset.exactHydrated).toBeUndefined();
	});
});
