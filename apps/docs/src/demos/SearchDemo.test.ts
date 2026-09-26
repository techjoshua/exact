// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { testComponent } from '@exactjs/testing';
import { App } from './SearchDemo.jsx';

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

it('shows the latest query results after a slower search was superseded', async () => {
	const view = await testComponent(App).mount();
	cleanup = () => view.unmount();
	const input = view.getBySelector('input');
	await input.input('l', { settleTasks: false });
	await expect
		.poll(() => document.querySelector('[role="status"]')?.textContent, { timeout: 400 })
		.toBe('Searching…');
	await new Promise((resolve) => setTimeout(resolve, 30));
	await input.input('li', { settleTasks: false });
	await view.settle();
	expect(document.querySelector('ul')?.textContent).toBe('Lisbon');
	await new Promise((resolve) => setTimeout(resolve, 850));
	expect(document.querySelector('ul')?.textContent).toBe('Lisbon');
	expect(document.querySelector('[role="status"]')?.textContent).toBe('Search complete');
	await input.input('');
	await expect.poll(() => document.querySelector('ul')?.textContent).toBe('');
});

it('releases a pending search when the component is removed', async () => {
	const view = await testComponent(App).mount();
	cleanup = () => view.unmount();
	await view.getBySelector('input').input('l', { settleTasks: false });
	view.unmount();
	cleanup = undefined;
	await new Promise((resolve) => setTimeout(resolve, 850));
	expect(document.querySelector('[aria-label="Destination search"]')).toBeNull();
});
