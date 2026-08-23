/**
 * @vitest-environment jsdom
 */
import { createDerived, type Component } from '@exactjs/core';
import {
	createCompiledVNode,
	createDynamicChild,
	createPreparedRenderProgram,
	keyCompiledVNode,
	prepareCompiledRenderProgram
} from '@exactjs/core/runtime/render';
import { createExactFrameworkFixtureArtifact } from '@exactjs/core/framework/component-contracts';
import { createCompiledRenderProgram as createCoreRenderProgram } from '@exactjs/core/runtime/render';
import {
	beginCompiledProgramClaims,
	bindCompiledProgramProperties,
	bindCompiledProgramKeyedChild,
	claimCompiledProgramElement,
	claimCompiledProgramKeyedChild,
	claimCompiledProgramProperty,
	enterCompiledProgramElement,
	leaveCompiledProgramElement
} from '@exactjs/dom/runtime/render-program';
import { withGenericRenderProgramBindings } from '@exactjs/dom/testing';
import { renderToString } from '@exactjs/ssr';
import { describe, expect, it, vi } from 'vitest';
import { hydrate, hydrateAfterNavigation } from './root.js';
import { createVNode } from './test-support/native-vnode.js';

const createCompiledRenderProgram: typeof createCoreRenderProgram = (
	cacheKey,
	createProgram,
	readers,
	fallback
) =>
	createCoreRenderProgram(
		cacheKey,
		() => withGenericRenderProgramBindings(createProgram()),
		readers,
		fallback
	);

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
				version: 3,
				id: 'root-marked-program',
				namespace: 'html',
				template: '<span data-exact-id="program-root">\ue000exact:0\ue001</span>',
				slots: [['text', 'program-text', [0]]],
				bindings: [['text', 0]],
				nodes: [['program-root', 'span', 'html']]
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

	it('activates bindings and structural children from a markerless compiled SSR program root', async () => {
		const items = [
			{ id: 'a', label: 'Alpha', kind: 'primary' },
			{ id: 'b', label: 'Beta', kind: 'secondary' }
		];
		const rowProgram = prepareCompiledRenderProgram({
			version: 3,
			id: 'markerless-ssr-row',
			namespace: 'html',
			template: '<li data-testid="row"></li>',
			root: ['li'],
			work: [1, 0],
			directClaims: true,
			ssr(target) {
				target.begin(1, 0);
				target.static('<li data-testid="row"></li>');
			}
		});
		const program = prepareCompiledRenderProgram({
			version: 3,
			id: 'markerless-ssr-children',
			namespace: 'html',
			template:
				'<section><select><option value="all">All</option><option value="primary">Primary</option></select><ul></ul></section>',
			directClaims: true,
			keyedChildren: 1,
			bind(target) {
				if (beginCompiledProgramClaims(target, 'section', 'html', 6, 2)) {
					claimCompiledProgramElement(target, 1, 0, 'select');
					claimCompiledProgramProperty(target, 1, 1);
					claimCompiledProgramElement(target, 2, 0, 'ul');
					enterCompiledProgramElement(target, 2);
					claimCompiledProgramKeyedChild(target, 0, 0);
					leaveCompiledProgramElement(target);
					return;
				}
				bindCompiledProgramKeyedChild(target, 0);
				bindCompiledProgramProperties(target, 0, 1);
			},
			ssr(target) {
				target.prepareChild(0);
				target.begin(6, 2);
				target.static(
					'<section><select><option value="all">All</option><option value="primary">Primary</option></select><ul>'
				);
				target.keyedChild(0);
				target.static('</ul></section>');
			}
		});
		const App = createExactFrameworkFixtureArtifact(function App(this: Component<{}>) {
			this.state.kind = 'all';
			const filtered = createDerived(() =>
				items.filter((item) => this.state.kind === 'all' || item.kind === this.state.kind)
			);
			return () =>
				createPreparedRenderProgram(
					program,
					[
						() =>
							filtered
								.get()
								.map((item) =>
									keyCompiledVNode(createPreparedRenderProgram(rowProgram, []), item.id)
								)
					],
					undefined,
					(_group, write) => {
						write('value', this.state.kind);
						write('__exactBindChange', (event: Event) => {
							this.state.kind = (event.currentTarget as HTMLSelectElement).value;
						});
					}
				);
		}, '@exactjs/hydrate:markerless-ssr-children');
		const vnode = createVNode(App, null);
		const container = document.createElement('main');
		container.innerHTML = renderToString(vnode).html;
		const serverItems = [...container.querySelectorAll('[data-testid="row"]')];

		const root = hydrate(vnode, container, { onMismatch: 'throw' });

		expect([...container.querySelectorAll('[data-testid="row"]')]).toEqual(serverItems);
		const select = container.querySelector('select')!;
		select.value = 'primary';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		await Promise.resolve();
		expect(container.querySelectorAll('[data-testid="row"]')).toHaveLength(1);
		root.dispose();
	});

	it('adopts and owns SSR DOM without exposing optional request methods', () => {
		const App = createExactFrameworkFixtureArtifact(function App(this: Component<{}>) {
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
