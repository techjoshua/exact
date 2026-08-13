/**
 * @vitest-environment jsdom
 */
import './structural-boundaries.js';
import { Suspense, markExactComponent, type Component } from '@exactjs/core';
import { createCompiledDynamicComponent } from '@exactjs/core/runtime/dynamic-components';
import { flushSync, reactive } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { render, unmount } from './index.js';
import { createVNode } from './test-support/native-vnode.js';

function LoadedPanel(this: Component<{}>, props: { label: string }) {
	this.onUnmount(() => unmounts++);
	return () => createVNode('p', null, props.label);
}
markExactComponent(LoadedPanel, 'fixture:loaded-panel');

let unmounts = 0;

describe('@exactjs/dom dynamic components', () => {
	it('uses native Suspense readiness and adopts the resolved component in its range', async () => {
		let settle!: (component: typeof LoadedPanel) => void;
		const pending = new Promise<typeof LoadedPanel>((resolve) => {
			settle = resolve;
		});
		function Host(this: Component<{}>) {
			const child = createCompiledDynamicComponent({
				id: 'fixture:async-panel',
				source: () => pending,
				props: { label: 'ready' }
			});
			return () => createVNode(Suspense, { fallback: createVNode('span', null, 'loading') }, child);
		}
		markExactComponent(Host, 'fixture:dynamic-host');

		const container = document.createElement('div');
		render(createVNode(Host, {}), container);
		expect(container.textContent).toBe('loading');

		settle(LoadedPanel);
		await settleMicrotasks();
		expect(container.textContent).toBe('ready');
		unmount(container);
	});

	it('cancels stale selections and disposes the adopted owner', async () => {
		unmounts = 0;
		const selection = reactive({ value: 0 });
		const signals: AbortSignal[] = [];
		function Host(this: Component<{}>) {
			const child = createCompiledDynamicComponent({
				id: 'fixture:replace-panel',
				source: (signal: AbortSignal) => {
					signals.push(signal);
					return selection.value === 0 ? LoadedPanel : undefined;
				},
				props: { label: 'selected' }
			});
			return () => child;
		}
		markExactComponent(Host, 'fixture:replacement-host');

		const container = document.createElement('div');
		render(createVNode(Host, {}), container);
		expect(container.textContent).toBe('selected');
		selection.value = 1;
		flushSync();
		expect(signals[0]?.aborted).toBe(true);
		expect(container.textContent).toBe('');
		expect(unmounts).toBe(1);
		unmount(container);
		expect(signals.at(-1)?.aborted).toBe(true);
	});
});

async function settleMicrotasks(): Promise<void> {
	for (let index = 0; index < 12; index++) {
		flushSync();
		await Promise.resolve();
	}
}
