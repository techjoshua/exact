/**
 * @vitest-environment jsdom
 */
import { type Component } from '@exactjs/core';
import { createCompiledVNode, createDynamicChild } from '@exactjs/core/runtime/render';
import { markExactComponent } from '@exactjs/core/framework/component-contracts';
import { createCompiledRenderProgram } from '@exactjs/core/runtime/render';
import { renderToString } from '@exactjs/ssr';
import { describe, expect, it, vi } from 'vitest';
import { hydrate, hydrateAfterNavigation } from './root.js';
import { createVNode } from './test-support/native-vnode.js';

describe('hydration-only root capability', () => {
	it('gives visible SSR content a rendering opportunity before passive hydration', async () => {
		const frames: FrameRequestCallback[] = [];
		const tasks: Array<() => void> = [];
		const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			frames.push(callback);
			return frames.length;
		});
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		vi.stubGlobal('scheduler', {
			postTask(work: () => void, options: { priority: string }) {
				expect(options.priority).toBe('user-visible');
				tasks.push(work);
				return Promise.resolve();
			}
		});
		try {
			const vnode = createVNode('p', null, 'Ready');
			const container = document.createElement('main');
			container.innerHTML = renderToString(vnode).html;
			const pending = hydrateAfterNavigation(vnode, container);

			expect(container.dataset.exactHydrated).toBeUndefined();
			expect(tasks).toHaveLength(0);
			frames.shift()!(performance.now());
			expect(tasks).toHaveLength(1);
			expect(container.dataset.exactHydrated).toBeUndefined();
			tasks.shift()!();

			const root = await pending;
			expect(container.dataset.exactHydrated).toBe('true');
			root.dispose();
		} finally {
			visibility.mockRestore();
			vi.unstubAllGlobals();
		}
	});

	it('activates synchronously when interaction precedes deferred navigation hydration', async () => {
		vi.useFakeTimers();
		try {
			const vnode = createVNode('button', { onClick: () => undefined }, 'Ready');
			const container = document.createElement('main');
			container.innerHTML = renderToString(vnode).html;
			const pending = hydrateAfterNavigation(vnode, container);

			container.querySelector('button')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));

			const root = await pending;
			expect(container.dataset.exactHydrated).toBe('true');
			root.dispose();
		} finally {
			vi.useRealTimers();
		}
	});

	it('rejects deferred hydration owned by another window realm', async () => {
		const frame = document.createElement('iframe');
		document.body.append(frame);
		const ownerDocument = frame.contentDocument!;
		try {
			const vnode = createVNode('p', null, 'Ready');
			const container = ownerDocument.createElement('main');
			container.innerHTML = renderToString(vnode).html;
			ownerDocument.body.append(container);

			await expect(hydrateAfterNavigation(vnode, container)).rejects.toThrow(
				'container owned by the current document'
			);
			expect(() => hydrate(vnode, container)).toThrow('container owned by the current document');
			expect(container.dataset.exactHydrated).toBeUndefined();
		} finally {
			frame.remove();
		}
	});

	it('cleans up after scheduler rejection and does not hydrate from a later interaction', async () => {
		const frames: FrameRequestCallback[] = [];
		const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			frames.push(callback);
			return frames.length;
		});
		vi.stubGlobal('cancelAnimationFrame', vi.fn());
		vi.stubGlobal('scheduler', {
			postTask() {
				return Promise.reject(new Error('scheduler unavailable'));
			}
		});
		try {
			const vnode = createVNode('button', null, 'Ready');
			const container = document.createElement('main');
			container.innerHTML = renderToString(vnode).html;
			const pending = hydrateAfterNavigation(vnode, container);
			frames.shift()!(performance.now());

			await expect(pending).rejects.toThrow('scheduler unavailable');
			container.dispatchEvent(new Event('pointerdown', { bubbles: true }));
			expect(container.dataset.exactHydrated).toBeUndefined();
		} finally {
			visibility.mockRestore();
			vi.unstubAllGlobals();
		}
	});

	it('rejects when scheduling throws synchronously', async () => {
		const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
		vi.stubGlobal('scheduler', {
			postTask() {
				throw new Error('scheduler failed synchronously');
			}
		});
		try {
			const vnode = createVNode('button', null, 'Ready');
			const container = document.createElement('main');
			container.innerHTML = renderToString(vnode).html;

			await expect(hydrateAfterNavigation(vnode, container)).rejects.toThrow(
				'scheduler failed synchronously'
			);
			expect(container.dataset.exactHydrated).toBeUndefined();
		} finally {
			visibility.mockRestore();
			vi.unstubAllGlobals();
		}
	});

	it('does not retry failed hydration from stale scheduled work or later interaction', async () => {
		vi.useFakeTimers();
		try {
			let attempts = 0;
			const vnode = createVNode('p', null, 'Ready');
			const container = document.createElement('main');
			container.innerHTML = renderToString(vnode).html;
			const pending = hydrateAfterNavigation(vnode, container, {
				onHydration() {
					attempts++;
					throw new Error('synthetic hydration failure');
				}
			});

			container.dispatchEvent(new Event('pointerdown', { bubbles: true }));
			await expect(pending).rejects.toThrow('synthetic hydration failure');
			container.dispatchEvent(new Event('keydown', { bubbles: true }));
			await vi.runAllTimersAsync();

			expect(attempts).toBe(1);
			expect(container.dataset.exactHydrated).toBeUndefined();
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
