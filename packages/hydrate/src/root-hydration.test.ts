/**
 * @vitest-environment jsdom
 */
import { createDerived, type Component } from '@exactjs/core';
import {
	createFrameworkFixtureComponentInstance,
	createPreparedRenderProgram,
	keyCompiledVNode,
	prepareCompiledRenderProgram
} from '@exactjs/core/runtime/render';
import { createExactFrameworkFixtureArtifact } from '@exactjs/core/framework/runtime-component-artifacts';
import { createPreparedServerRenderProgram } from '@exactjs/core/framework/server-render-structure';
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

function RenderProgramOwner(this: Component<{}>) {
	return () => null;
}
const renderProgramOwner = createFrameworkFixtureComponentInstance(RenderProgramOwner, {});

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
		const descriptor = prepareCompiledRenderProgram(
			withGenericRenderProgramBindings({
				version: 4,
				id: 'root-marked-program',
				namespace: 'html',
				template: '<span data-exact-id="program-root">\ue000exact:0\ue001</span>',
				slots: [['text', 'program-text', [0]]],
				bindings: [['text', 0]],
				nodes: [[0, 'span', 'html']],
				ssr(target, context, invocation) {
					const value = target.prepareText(invocation, 0);
					if (value === target.unprepared) return;
					const output: Array<string | readonly unknown[]> = [];
					target.begin(context, 1, 1, 44);
					target.static(output, '<span data-exact-id="program-root">');
					target.text(context, output, value, 'program-text', 44);
					target.static(output, '</span>');
					return output;
				}
			})
		);
		const componentId = '@exactjs/hydrate:root-marked-program';
		const ClientApp = createExactFrameworkFixtureArtifact(function ClientApp() {
			return () =>
				createPreparedRenderProgram(descriptor, [() => 'ready'], renderProgramOwner);
		}, componentId);
		const ServerApp = createExactFrameworkFixtureArtifact(function ServerApp() {
			return () => createPreparedServerRenderProgram(descriptor, ['ready']);
		}, componentId);
		const clientVNode = createVNode(ClientApp, null);
		const serverVNode = createVNode(ServerApp, null);
		const container = document.createElement('main');
		container.innerHTML = renderToString(serverVNode).html;
		const span = container.querySelector('span');
		const root = hydrate(clientVNode, container);

		expect(container.querySelector('span')).toBe(span);
		root.dispose();
	});

	it('activates bindings and structural children from a markerless compiled SSR program root', async () => {
		const items = [
			{ id: 'a', label: 'Alpha', kind: 'primary' },
			{ id: 'b', label: 'Beta', kind: 'secondary' }
		];
		const rowProgram = prepareCompiledRenderProgram({
			version: 4,
			id: 'markerless-ssr-row',
			namespace: 'html',
			template: '<li data-testid="row"></li>',
			root: ['li'],
			work: [1, 0],
			directClaims: true,
			ssr(target, context) {
				target.begin(context, 1, 0, 0);
				const output: Array<string | readonly unknown[]> = [];
				target.static(output, '<li data-testid="row"></li>');
				return output;
			}
		});
		const program = prepareCompiledRenderProgram({
			version: 4,
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
			ssr(target, context, invocation) {
				const child = target.prepareChild(invocation, 0);
				if (child === target.unprepared) return;
				const output: Array<string | readonly unknown[]> = [];
				target.begin(context, 6, 2, 0);
				target.static(
					output,
					'<section><select><option value="all">All</option><option value="primary">Primary</option></select><ul>'
				);
				target.keyedChild(output, child);
				target.static(output, '</ul></section>');
				return output;
			}
		});
		const componentId = '@exactjs/hydrate:markerless-ssr-children';
		const App = createExactFrameworkFixtureArtifact(function App(
			this: Component<{ kind: string }>
		) {
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
									keyCompiledVNode(createPreparedRenderProgram(rowProgram, [], this), item.id)
								)
					],
					this,
					undefined,
					(_group, write) => {
						write('value', this.state.kind);
						write('__exactBindChange', (event: Event) => {
							this.state.kind = (event.currentTarget as HTMLSelectElement).value;
						});
					}
				);
		}, componentId);
		const ServerApp = createExactFrameworkFixtureArtifact(function ServerApp() {
			return () =>
				createPreparedServerRenderProgram(program, [
					items.map((item) =>
						keyCompiledVNode(createPreparedServerRenderProgram(rowProgram, []), item.id)
					)
				]);
		}, componentId);
		const vnode = createVNode(App, null);
		const container = document.createElement('main');
		container.innerHTML = renderToString(createVNode(ServerApp, null)).html;
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
