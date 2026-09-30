/** @vitest-environment jsdom */
import { it, expect, vi } from 'vitest';
import { Activity, type Component, type ActivityMode } from '@exactjs/core';
import { createExpression } from '@exactjs/core/runtime/render';
import { createTestOperation as jsx } from '@exactjs/testing/internal/fixtures';
import { mountTest } from '@exactjs/testing';
import './structural-boundaries.js';
import { flushSync } from '@exactjs/reactive';
import { CompiledPanel } from './test-support/components/activity-task.fixtures.js';
import { reset, finish } from './test-support/components/activity-task-control.js';
it('parks compiled task publication and resumes the retained DOM', async () => {
	reset();
	let app!: Component<{ mode: ActivityMode }>;
	function App(this: Component<{ mode: ActivityMode }>) {
		app = this;
		this.state.mode = 'active';
		return () =>
			jsx(Activity, { mode: createExpression(() => this.state.mode) }, jsx(CompiledPanel, {}));
	}
	const root = document.createElement('div');
	const view = await mountTest(jsx(App, {}), { container: root, settleTasks: false });
	try {
		const node = root.querySelector('p')!;
		await new Promise((r) => setTimeout(r, 0));
		app.state.mode = 'parked';
		flushSync();
		finish();
		await new Promise((r) => setTimeout(r, 0));
		app.state.mode = 'active';
		flushSync();
		expect(node.textContent).toBe('base');
		await vi.waitFor(() => {
			flushSync();
			expect(node.textContent).toBe('ready');
		});
		expect(root.querySelector('p')).toBe(node);
	} finally {
		view.unmount();
	}
});
