// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { testComponent } from '@exactjs/testing';
import { PerformancePageFixture } from './PerformancePage.fixtures.jsx';

it('keeps one organized measurements table per distribution and concurrency chart', async () => {
	const originalUrl = window.location.href;
	window.history.replaceState(null, '', '#/performance');
	const view = await testComponent(PerformancePageFixture).mount();
	try {
		const percentileViews = [...view.container.querySelectorAll('summary')].filter(
			(summary) => summary.textContent === 'View values and percentiles'
		);
		expect(percentileViews.length).toBeGreaterThan(0);
		for (const summary of percentileViews) {
			const card = summary.closest('.performance-chart-card')!;
			expect(card.querySelectorAll('table')).toHaveLength(1);
			expect(card.querySelector('caption')?.textContent).toMatch(/\(.+\)$/);
			expect(card.textContent).not.toContain('View chart data');
			const headers = [...card.querySelectorAll('thead th')].map((cell) => cell.textContent);
			expect(headers).toEqual(expect.arrayContaining(['P50', 'P75', 'P95', 'P99']));
			expect(headers.some((header) => header === 'Mean' || header === 'Window mean')).toBe(true);
		}
		const experience = view.container.querySelector('#browser-experience')!;
		expect(experience.textContent).toContain('Largest contentful paint');
		expect(experience.textContent).toContain('Browser interaction latency');
		expect(experience.textContent).not.toContain('Browser load event');
		const diagnostics = [...view.container.querySelectorAll('details')].find(
			(details) =>
				details.querySelector('summary')?.textContent ===
				'Loading, service readiness, CPU, and memory diagnostics'
		)!;
		expect(diagnostics.open).toBe(false);
		expect(diagnostics.textContent).toContain('Browser load event (diagnostic)');
		const startup = [...view.container.querySelectorAll('table')].find(
			(table) => table.caption?.textContent === 'Startup clicks on fresh pages'
		)!;
		expect(startup.querySelectorAll('tbody tr')).toHaveLength(15);
		expect(startup.textContent).toContain('Client scripts held');
		expect(startup.textContent).toContain('0 / 5');
		const links = view.container.querySelectorAll<HTMLAnchorElement>('a[href^="#/performance#"]');
		expect(links).toHaveLength(4);
		for (const link of links) {
			const id = link.hash.split('#')[2]!;
			const target = view.container.querySelector<HTMLElement>(`#${id}`)!;
			expect(target).not.toBeNull();
			const scroll = vi.fn();
			target.scrollIntoView = scroll;
			await hashChange(() => link.click());
			await view.flush();
			expect(window.location.hash).toBe(link.hash);
			expect(scroll).toHaveBeenCalledWith({ block: 'start' });
			expect(document.activeElement).toBe(target);
		}
		await hashChange(() => window.history.back());
		await view.flush();
		expect(window.location.hash).toBe('#/performance#server-response');
		expect(document.activeElement?.id).toBe('server-response');
		await hashChange(() => window.history.forward());
		await view.flush();
		expect(window.location.hash).toBe('#/performance#response-size');
		expect(document.activeElement?.id).toBe('response-size');
		view.container.querySelector<HTMLElement>('#server-response')!.focus();
		const historyLength = window.history.length;
		links[3]!.click();
		await view.flush();
		expect(document.activeElement?.id).toBe('response-size');
		expect(window.history.length).toBe(historyLength);
		const capacityCharts = [
			...view.container.querySelectorAll('figure[id^="performance-sustained-preloaded-"]')
		];
		expect(capacityCharts).toHaveLength(4);
		for (const chart of capacityCharts) {
			expect(chart.querySelectorAll('table')).toHaveLength(1);
			expect(chart.textContent).not.toContain('View chart data');
			expect([...chart.querySelectorAll('thead th')].map((cell) => cell.textContent)).toEqual([
				'Framework',
				'16 in flight',
				'32 in flight',
				'64 in flight',
				'128 in flight'
			]);
			expect(chart.querySelectorAll('tbody tr')).toHaveLength(2);
			expect(chart.querySelectorAll('tbody td')).toHaveLength(8);
			expect(chart.textContent).not.toContain('Not measured');
		}
	} finally {
		view.unmount();
		window.history.replaceState(null, '', originalUrl);
	}
});

/** Waits for browser history delivery rather than assuming hash navigation is synchronous. */
async function hashChange(navigate: () => void): Promise<void> {
	const changed = new Promise<void>((resolve) => {
		window.addEventListener('hashchange', () => resolve(), { once: true });
	});
	navigate();
	await changed;
}

it('focuses a section when opening its copied URL', async () => {
	const originalUrl = window.location.href;
	const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
	const scroll = vi.fn();
	Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
		configurable: true,
		value: scroll
	});
	window.history.replaceState(null, '', '#/performance#server-throughput');
	let cleanup: (() => void) | undefined;
	try {
		const view = await testComponent(PerformancePageFixture).mount();
		cleanup = () => view.unmount();
		await view.flush();
		const target = view.container.querySelector('#server-throughput');
		expect(document.activeElement).toBe(target);
		expect(scroll).toHaveBeenCalledWith({ block: 'start' });
	} finally {
		cleanup?.();
		window.history.replaceState(null, '', originalUrl);
		if (originalScroll)
			Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll);
		else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
	}
});
