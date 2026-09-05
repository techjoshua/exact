/**
 * @vitest-environment jsdom
 */
import { readCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { renderToString } from '@exactjs/ssr';
import { renderToHydratableString } from '@exactjs/ssr';
import { describe, expect, it, vi } from 'vitest';
import { hydrate, hydrateAfterNavigation } from './root.js';
import { hydrateCompiledComponentRoot } from './framework/component-root.js';
import {
	identifiedParagraphRoot,
	markerlessListRoot,
	mountedMarkerlessListRoot,
	readyParagraphRoot
} from './test-support/basic-roots.fixtures.js';
import {
	identifiedParagraphRoot as serverIdentifiedParagraphRoot,
	markerlessListRoot as serverMarkerlessListRoot,
	readyParagraphRoot as serverReadyParagraphRoot
} from './test-support/basic-roots.fixtures.js?exact-target=server';

describe('hydration-only root capability', () => {
	it('hydrates an opaque compiler component receipt as the root operation', () => {
		const container = document.createElement('main');
		const profile: Array<{ subsystem: string; phase: string }> = [];
		const rendered = renderToHydratableString(
			serverIdentifiedParagraphRoot('receipt-root', 'Ready')
		);
		container.innerHTML = rendered.html;
		const existing = container.querySelector('#receipt-root');

		const root = hydrate(identifiedParagraphRoot('receipt-root', 'Ready'), container, {
			resumptions: rendered.resumptions,
			onProfile: (event) => profile.push(event)
		});

		expect(container.querySelector('#receipt-root')).toBe(existing);
		expect(container.dataset.exactHydrated).toBe('true');
		expect(profile.map((event) => `${event.subsystem}:${event.phase}`)).toEqual([
			'hydrate:hydrate'
		]);
		root.dispose();
	});

	it('hydrates an opaque component root before its retained hydration bootstrap script', () => {
		const container = document.createElement('main');
		const rendered = renderToHydratableString(
			serverIdentifiedParagraphRoot('receipt-root-with-bootstrap', 'Ready')
		);
		container.innerHTML = `${rendered.html}<script type="application/json" id="__exact_hydration">{}</script>`;
		const existing = container.querySelector('#receipt-root-with-bootstrap');
		const bootstrap = container.querySelector('#__exact_hydration');

		const root = hydrate(
			identifiedParagraphRoot('receipt-root-with-bootstrap', 'Ready'),
			container,
			{
				resumptions: rendered.resumptions
			}
		);

		expect(container.querySelector('#receipt-root-with-bootstrap')).toBe(existing);
		expect(container.querySelector('#__exact_hydration')).toBe(bootstrap);
		expect(container.dataset.exactHydrated).toBe('true');
		root.dispose();
	});

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
			const vnode = readyParagraphRoot;
			const container = document.createElement('main');
			container.innerHTML = renderToString(serverReadyParagraphRoot).html;
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
			const vnode = readyParagraphRoot;
			const container = document.createElement('main');
			container.innerHTML = renderToString(serverReadyParagraphRoot).html;
			const pending = hydrateAfterNavigation(vnode, container);

			container.querySelector('p')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));

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
			const vnode = readyParagraphRoot;
			const container = ownerDocument.createElement('main');
			container.innerHTML = renderToString(serverReadyParagraphRoot).html;
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
			const vnode = readyParagraphRoot;
			const container = document.createElement('main');
			container.innerHTML = renderToString(serverReadyParagraphRoot).html;
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
			const vnode = readyParagraphRoot;
			const container = document.createElement('main');
			container.innerHTML = renderToString(serverReadyParagraphRoot).html;

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
			const vnode = readyParagraphRoot;
			const container = document.createElement('main');
			container.innerHTML = renderToString(serverReadyParagraphRoot).html;
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
		const container = document.createElement('main');
		const rendered = renderToHydratableString(serverReadyParagraphRoot);
		container.innerHTML = rendered.html;
		const paragraph = container.querySelector('p');
		const root = hydrate(readyParagraphRoot, container, { resumptions: rendered.resumptions });

		expect(container.querySelector('p')).toBe(paragraph);
		root.dispose();
	});

	it('activates bindings and structural children from a markerless compiled SSR program root', async () => {
		const container = document.createElement('main');
		const rendered = renderToHydratableString(serverMarkerlessListRoot, { markers: false });
		container.innerHTML = rendered.html;
		const serverItems = [...container.querySelectorAll('[data-testid="row"]')];

		const root = hydrate(markerlessListRoot, container, {
			allowMarkerless: true,
			onMismatch: 'throw',
			resumptions: rendered.resumptions
		});

		expect([...container.querySelectorAll('[data-testid="row"]')]).toEqual(serverItems);
		mountedMarkerlessListRoot().state.kind = 'primary';
		await Promise.resolve();
		expect(container.querySelectorAll('[data-testid="row"]')).toHaveLength(1);
		root.dispose();
	});

	it('keeps root hydration metadata outside markerless component output', () => {
		const container = document.createElement('main');
		const rendered = renderToHydratableString(serverReadyParagraphRoot, { markers: false });
		container.innerHTML = `${rendered.html}<script type="application/json" id="__exact_hydration">{"m":1}</script>`;
		const paragraph = container.querySelector('p');
		const bootstrap = container.querySelector('#__exact_hydration');

		const root = hydrateCompiledComponentRoot(readyParagraphRoot, container, {
			markerlessRoot: true,
			onMismatch: 'throw',
			resumptions: rendered.resumptions
		});

		expect(container.querySelector('p')).toBe(paragraph);
		expect(container.querySelector('#__exact_hydration')).toBe(bootstrap);
		root.dispose();
	});

	it('adopts and owns SSR DOM without exposing optional request methods', () => {
		const container = document.createElement('main');
		const rendered = renderToHydratableString(serverIdentifiedParagraphRoot('message', 'ready'));
		container.innerHTML = rendered.html;
		const paragraph = container.querySelector('p');

		const root = hydrate(identifiedParagraphRoot('message', 'ready'), container, {
			resumptions: rendered.resumptions
		});

		expect(container.querySelector('p')).toBe(paragraph);
		expect('invokeTask' in root).toBe(false);
		expect(container.dataset.exactHydrated).toBe('true');
		root.dispose();
		expect(container.dataset.exactHydrated).toBeUndefined();
	});

	it('attaches a matching native root through its generated hydration ABI', () => {
		const vnode = readyParagraphRoot;
		const artifact = readCompiledComponentReceipt(vnode)!.contract.artifact as unknown as {
			attach(instance: object, target: object, mode: 'mount' | 'hydrate'): object;
		};
		const attach = vi.spyOn(artifact, 'attach');
		const container = document.createElement('main');
		const rendered = renderToHydratableString(serverReadyParagraphRoot);
		container.innerHTML = rendered.html;

		const root = hydrate(vnode, container, {
			onMismatch: 'throw',
			resumptions: rendered.resumptions
		});

		expect(attach).toHaveBeenCalledTimes(1);
		expect(attach.mock.calls[0]![2]).toBe('hydrate');
		root.dispose();
		attach.mockRestore();
	});

	it('routes a failed generated claim into the same artifact mount ABI', () => {
		const vnode = identifiedParagraphRoot('recovered', 'ready');
		const artifact = readCompiledComponentReceipt(vnode)!.contract.artifact as unknown as {
			attach(instance: object, target: object, mode: 'mount' | 'hydrate'): object;
		};
		const attach = vi.spyOn(artifact, 'attach');
		const container = document.createElement('main');
		const rendered = renderToHydratableString(serverIdentifiedParagraphRoot('recovered', 'ready'));
		container.innerHTML = rendered.html;
		container.querySelector('p')!.replaceWith(document.createElement('section'));

		const root = hydrate(vnode, container, { resumptions: rendered.resumptions });

		expect(attach.mock.calls.map((call) => call[2])).toEqual(['hydrate', 'mount']);
		expect(container.querySelector('p#recovered')?.textContent).toBe('ready');
		root.dispose();
		attach.mockRestore();
	});
});
