// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { testComponent } from '@exactjs/testing';
import { PerformancePageFixture } from './PerformancePage.fixtures.jsx';

it('keeps one organized measurements table per distribution and concurrency chart', async () => {
	const view = await testComponent(PerformancePageFixture).mount();
	try {
		const percentileViews = [...view.container.querySelectorAll('summary')].filter(
			(summary) => summary.textContent === 'View values and percentiles'
		);
		expect(percentileViews.length).toBeGreaterThan(0);
		for (const summary of percentileViews) {
			const card = summary.closest('.performance-chart-card')!;
			expect(card.querySelectorAll('table')).toHaveLength(1);
			expect(card.textContent).not.toContain('View chart data');
			const headers = [...card.querySelectorAll('thead th')].map((cell) => cell.textContent);
			expect(headers).toEqual(expect.arrayContaining(['P50', 'P75', 'P95', 'P99']));
			expect(headers.some((header) => header === 'Mean' || header === 'Window mean')).toBe(true);
		}
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
	}
});
