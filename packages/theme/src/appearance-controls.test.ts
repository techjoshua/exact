/** @vitest-environment jsdom */
import { testComponent } from '@exactjs/testing';
import { expect, it } from 'vitest';
import { AppTheme } from './test-support/appearance-controls.fixtures.js';

it('lets a nested control update the scope owner through an application context', async () => {
	const view = await testComponent(AppTheme).mount();
	try {
		const light = view.getByRole('button', { name: 'Light' });
		const dark = view.getByRole('button', { name: 'Dark' });
		expect(view.root.state().appearance).toBe('system');
		await dark.click();
		expect(view.root.state().appearance).toBe('dark');
		expect(dark.element.getAttribute('aria-pressed')).toBe('true');
		expect(light.element.getAttribute('aria-pressed')).toBe('false');
		expect(view.container.querySelector('[data-exact-theme-appearance="dark"]')).not.toBeNull();
		await light.click();
		expect(view.root.state().appearance).toBe('light');
		expect(light.element.getAttribute('aria-pressed')).toBe('true');
		expect(view.container.querySelector('[data-exact-theme-appearance="light"]')).not.toBeNull();
	} finally {
		view.unmount();
	}
});

import {
	Probe,
	ContextProbe,
	ThemedDirect,
	ScopeOnly
} from '../../component-composition-corpus/test-support/controlled-select/select.fixtures.js';

for (const [name, Component, label] of [
	['direct program', Probe, 'Choice'],
	['context and supplied child', ContextProbe, 'Context choice'],
	['direct themed field', ThemedDirect, 'Direct'],
	['scope-only field', ScopeOnly, 'Scope only']
] as const) {
	it(`retains initial select value through ${name}`, async () => {
		const view = await testComponent(Component).props({ value: 'dark' }).mount();
		try {
			expect(view.getByLabelText(label).value()).toBe('dark');
			expect(view.getByLabelText(label).element.querySelectorAll('option')).toHaveLength(
				name === 'direct program' || name === 'context and supplied child' ? 3 : 2
			);
		} finally {
			view.unmount();
		}
	});
}
