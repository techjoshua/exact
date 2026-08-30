/**
 * @vitest-environment jsdom
 */
import './structural-boundaries.js';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { unmount } from './index.js';
import { renderTestTree as render } from './testing.js';
import { createCompiledComponentOperation } from './test-support/native-operations.js';
import {
	AsyncPanelHost,
	clearSelectedPanel,
	getLoadedPanelUnmounts,
	getReplacementSignals,
	LoadedPanel,
	ReplacementPanelHost,
	resetReplacementPanelFixture,
	setPendingPanelSource
} from './dynamic-component.fixtures.js';

describe('@exactjs/dom dynamic components', () => {
	it('uses native Suspense readiness and adopts the resolved component in its range', async () => {
		let settle!: (component: typeof LoadedPanel) => void;
		const pending = new Promise<typeof LoadedPanel>((resolve) => {
			settle = resolve;
		});
		setPendingPanelSource(pending);

		const container = document.createElement('div');
		render(createCompiledComponentOperation(AsyncPanelHost, {}), container);
		expect(container.textContent).toBe('loading');

		settle(LoadedPanel);
		await settleMicrotasks();
		expect(container.textContent).toBe('ready');
		unmount(container);
	});

	it('cancels stale selections and disposes the adopted owner', async () => {
		resetReplacementPanelFixture();

		const container = document.createElement('div');
		render(createCompiledComponentOperation(ReplacementPanelHost, {}), container);
		expect(container.textContent).toBe('selected');
		clearSelectedPanel();
		flushSync();
		expect(getReplacementSignals()[0]?.aborted).toBe(true);
		expect(container.textContent).toBe('');
		expect(getLoadedPanelUnmounts()).toBe(1);
		unmount(container);
		expect(getReplacementSignals().at(-1)?.aborted).toBe(true);
	});
});

async function settleMicrotasks(): Promise<void> {
	for (let index = 0; index < 12; index++) {
		flushSync();
		await Promise.resolve();
	}
}
