// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { testComponent } from '@exactjs/testing';
import { App } from './SearchDemo.jsx';

let cleanup: (() => void) | undefined;
beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
	vi.useRealTimers();
});

it('shows the latest query results after a slower search was superseded', async () => {
	const view = await testComponent(App).configure({ settleTasks: false }).mount();
	cleanup = () => view.unmount();
	const input = view.getBySelector('input');
	await input.input('p', { settleTasks: false });
	await view.flush();
	expect(document.querySelector('[role="status"]')?.textContent).toBe('Searching…');
	await vi.advanceTimersByTimeAsync(30);
	await input.input('pa', { settleTasks: false });
	await vi.advanceTimersByTimeAsync(200);
	await view.flush();
	expect(document.querySelector('ul')?.textContent).toBe('Paris');
	await vi.advanceTimersByTimeAsync(850);
	expect(document.querySelector('ul')?.textContent).toBe('Paris');
	expect(document.querySelector('[role="status"]')?.textContent).toBe('Search complete');
	await input.input('');
	await vi.advanceTimersByTimeAsync(200);
	await view.flush();
	expect(document.querySelector('ul')?.textContent).toBe('');
});

it('releases a pending search when the component is removed', async () => {
	const view = await testComponent(App).configure({ settleTasks: false }).mount();
	cleanup = () => view.unmount();
	await view.getBySelector('input').input('p', { settleTasks: false });
	view.unmount();
	cleanup = undefined;
	await vi.advanceTimersByTimeAsync(850);
	expect(document.querySelector('[aria-label="Destination search"]')).toBeNull();
});
