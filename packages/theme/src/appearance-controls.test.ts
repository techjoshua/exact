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
