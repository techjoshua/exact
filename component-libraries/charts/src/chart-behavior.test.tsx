import { TableChartFixture, StatisticTableFixture } from './test-support/chart-table.fixtures.js';
/**
 * @vitest-environment jsdom
 */
import { testComponent } from '@exactjs/testing';
import { describe, expect, it } from 'vitest';
import {
	ChartFixture,
	CompactChartFixture,
	CustomDataViewFixture,
	MotionChartFixture,
	ReactiveChartLabelsFixture
} from './test-support/chart-behavior.fixtures.js';

describe('native chart composition', () => {
	it('updates one chart-owned table while retaining identity and complete data when a series is hidden', async () => {
		const view = await testComponent(TableChartFixture).mount();
		try {
			const table = view.container.querySelector('table')!;
			const values = () => [...table.querySelectorAll('tbody td')].map((cell) => cell.textContent);
			expect(view.container.querySelectorAll('table')).toHaveLength(1);
			expect(table.closest('details')).toBeNull();
			expect(values()).toEqual(['1.25', '2.00', '3.25']);
			view.container.querySelector<HTMLButtonElement>('#table-update')!.click();
			await view.flush();
			expect(view.container.querySelector('table')).toBe(table);
			expect(values()).toEqual(['2.25', '2.00', '4.25']);
			view.container.querySelector<HTMLButtonElement>('[data-chart-series="objects"]')!.click();
			await view.flush();
			expect(view.container.querySelectorAll('rect.exact-chart__datum')).toHaveLength(1);
			expect(values()).toEqual(['2.25', '2.00', '4.25']);
			view.container.querySelector<HTMLButtonElement>('#table-order')!.click();
			await view.flush();
			expect(values()).toEqual(['2.00', '2.25', '4.25']);
			view.container.querySelector<HTMLButtonElement>('#table-remove')!.click();
			await view.flush();
			expect(values()).toEqual(['Not available', '2.25', 'Not available']);
			view.container.querySelector<HTMLButtonElement>('#table-remove')!.click();
			await view.flush();
			expect(values()).toEqual(['2.00', '2.25', '4.25']);
		} finally {
			view.unmount();
		}
	});

	it('updates a supplementary statistic without changing the plotted aggregate', async () => {
		const view = await testComponent(StatisticTableFixture).mount();
		try {
			const cells = [...view.container.querySelectorAll('tbody td')];
			expect(cells.map((cell) => cell.textContent)).toEqual(['20', '12', '12–30']);
			view.container.querySelector<HTMLButtonElement>('#statistic-update')!.click();
			await view.flush();
			expect(cells.map((cell) => cell.textContent)).toEqual(['20', '13', '13–30']);
		} finally {
			view.unmount();
		}
	});

	it('replaces the generic disclosure with one reactive custom data view', async () => {
		const view = await testComponent(CustomDataViewFixture).mount();
		try {
			const figure = view.container.querySelector('figure')!;
			const table = figure.querySelector('table')!;
			expect(figure.querySelectorAll('details')).toHaveLength(1);
			expect(figure.querySelectorAll('table')).toHaveLength(1);
			expect(figure.textContent).not.toContain('View chart data');
			expect(table.querySelector('td')?.textContent).toBe('12');
			figure.querySelector('button')!.click();
			await view.flush();
			expect(figure.querySelector('table')).toBe(table);
			expect(table.querySelector('td')?.textContent).toBe('13');
			expect(figure.querySelector('svg')).not.toBeNull();
		} finally {
			view.unmount();
		}
	});

	it('places labels by role and retains their reactive DOM', async () => {
		const view = await testComponent(ReactiveChartLabelsFixture).mount();
		try {
			const figure = view.container.querySelector('figure')!;
			const caption = figure.querySelector('figcaption')!;
			const button = caption.querySelector('button')!;
			expect(figure.firstElementChild).toBe(caption);
			expect(caption.nextElementSibling?.id).toBe('reactive-labels-description');
			button.click();
			await view.flush();
			expect(figure.querySelector('figcaption')).toBe(caption);
			expect(caption.querySelector('button')).toBe(button);
			expect(button.textContent).toBe('After');
			expect(figure.querySelectorAll('figcaption')).toHaveLength(1);
		} finally {
			view.unmount();
		}
	});
	it('renders registered geometry and an equivalent semantic data view', async () => {
		const view = await testComponent(ChartFixture).mount();
		const figure = view.container.querySelector('figure')!;
		expect(figure.firstElementChild?.tagName).toBe('FIGCAPTION');
		expect(figure.querySelector('#requests-chart-title')?.parentElement).toBe(figure);
		expect(figure.querySelector('#requests-chart-description')?.parentElement).toBe(figure);
		expect(figure.querySelector('.exact-chart__declarations figcaption')).toBeNull();
		expect(figure.getAttribute('aria-describedby')).toBe('requests-chart-description');
		expect(figure.querySelectorAll('circle')).toHaveLength(2);
		expect(figure.querySelector('table')?.textContent).toContain('eXact');
		expect(figure.querySelector('table')?.textContent).toContain('6900');
		expect(figure.querySelector('[data-chart-index="1"]')?.getAttribute('aria-describedby')).toBe(
			'requests-chart-datum-c32-description'
		);
		expect(figure.querySelector('#requests-chart-datum-c32-description')?.textContent).toBe(
			'Highest sustained lane.'
		);
		view.unmount();
	});

	it('shares hover, touch, focus, and keyboard inspection through one tooltip', async () => {
		const view = await testComponent(ChartFixture).mount();
		const first = view.container.querySelector<SVGElement>('[data-chart-index="0"]')!;
		const second = view.container.querySelector<SVGElement>('[data-chart-index="1"]')!;
		const tooltip = view.container.querySelector<HTMLElement>('[role="tooltip"]')!;

		first.dispatchEvent(new Event('focusin', { bubbles: true }));
		await view.flush();
		expect(tooltip.hidden).toBe(false);
		expect(tooltip.textContent).toContain('Concurrency 1: 5200');

		first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		await view.flush();
		expect(document.activeElement).toBe(second);
		expect(tooltip.textContent).toContain('Concurrency 32: 6900');

		second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
		await view.flush();
		expect(document.activeElement).toBe(first);
		first.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
		await view.flush();
		expect(document.activeElement).toBe(second);

		second.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		second.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
		await view.flush();
		expect(tooltip.hidden).toBe(false);

		second.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await view.flush();
		expect(tooltip.hidden).toBe(true);
		view.unmount();
	});

	it('selects the nearest datum from a line and clears inspection after leaving its hit region', async () => {
		const view = await testComponent(ChartFixture).mount();
		const svg = view.container.querySelector<SVGSVGElement>('svg')!;
		const line = view.container.querySelector<SVGPathElement>('.exact-chart__line-hit')!;
		const tooltip = view.container.querySelector<HTMLElement>('[role="tooltip"]')!;
		svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 320 }) as DOMRect;

		line.dispatchEvent(
			new MouseEvent('pointermove', { bubbles: true, clientX: 600, clientY: 100 })
		);
		await view.flush();
		expect(tooltip.textContent).toContain('Concurrency 32: 6900');

		line.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: svg }));
		await view.flush();
		expect(tooltip.hidden).toBe(true);
		view.unmount();
	});

	it('retains tooltip placement for an opt-in CSS exit transition', async () => {
		const view = await testComponent(MotionChartFixture).mount();
		const figure = view.container.querySelector('figure')!;
		const mark = view.container.querySelector<SVGElement>('[data-chart-index="0"]')!;
		const tooltip = view.container.querySelector<HTMLElement>('[role="tooltip"]')!;
		expect(figure.classList.contains('exact-chart--motion')).toBe(true);

		mark.dispatchEvent(new Event('focusin', { bubbles: true }));
		await view.flush();
		expect(tooltip.dataset.visible).toBe('true');
		mark.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
		await view.flush();
		expect(tooltip.hidden).toBe(false);
		expect(tooltip.dataset.visible).toBe('false');
		expect(tooltip.textContent).toContain('First: 1');
		view.unmount();
	});

	it('normalizes compact inputs and exposes keyboard-operable legend controls', async () => {
		const compact = await testComponent(CompactChartFixture).mount();
		expect(compact.container.querySelectorAll('rect.exact-chart__datum')).toHaveLength(1);
		expect(compact.container.querySelector('.exact-chart__datum')?.getAttribute('aria-label')).toBe(
			'eXact: 2.1. Post-GC used heap'
		);
		expect(compact.container.querySelector('.exact-chart__axis-labels')?.textContent).toContain(
			'Retained heap'
		);
		compact.unmount();

		const view = await testComponent(ChartFixture).mount();
		const control = view.container.querySelector<HTMLButtonElement>('[data-chart-series="exact"]')!;
		expect(control.getAttribute('aria-pressed')).toBe('true');
		control.click();
		await view.flush();
		expect(
			view.container
				.querySelector<HTMLButtonElement>('[data-chart-series="exact"]')
				?.getAttribute('aria-pressed')
		).toBe('false');
		expect(view.container.querySelectorAll('circle')).toHaveLength(0);
		view.unmount();
	});
});
