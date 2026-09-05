/**
 * @vitest-environment jsdom
 */
import { testComponent } from '@exactjs/testing';
import { describe, expect, it } from 'vitest';
import {
	ChartFixture,
	CompactChartFixture,
	MotionChartFixture
} from './chart-behavior.fixtures.js';

describe('native chart composition', () => {
	it('renders registered geometry and an equivalent semantic data view', async () => {
		const view = await testComponent(ChartFixture).mount();
		const figure = view.container.querySelector('figure')!;
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
