import { describe, expect, it } from 'vitest';
import type { ChartSeriesRegistration } from './model.js';
import { linePath, positionSeries, resolveGeometryDomain } from './geometry.js';
import { resolveChartLayout } from './layout.js';

function series(values: readonly [string, number][]): ChartSeriesRegistration {
	return {
		chartId: 'test-chart',
		props: { id: 'exact' },
		data: new Map(values.map(([x, value]) => [x, { props: { id: x, x, value } }]))
	};
}

describe('chart geometry', () => {
	it('keeps categorical identity separate from numeric values', () => {
		const input = series([
			['p50', 33],
			['p95', 38]
		]);
		const domain = resolveGeometryDomain('line', [input]);
		const points = positionSeries(input, domain, resolveChartLayout({ width: 640, height: 360 }));

		expect(domain.categories).toEqual(['p50', 'p95']);
		expect(points.map((point) => point.label)).toEqual(['p50', 'p95']);
		expect(linePath(points)).toMatch(/^M\d+(?:\.\d+)?,\d+(?:\.\d+)?L/u);
	});

	it('includes zero in bar domains while preserving line comparison detail', () => {
		const input = series([
			['Exact', 95],
			['React', 100]
		]);
		expect(resolveGeometryDomain('bar', [input]).y[0]).toBeLessThan(0);
		expect(resolveGeometryDomain('line', [input]).y[0]).toBeGreaterThan(90);
	});

	it('uses cumulative positive and negative extents for stacked bars', () => {
		const first = series([
			['current', 70],
			['previous', -20]
		]);
		const second = {
			...series([
				['current', 50],
				['previous', -30]
			]),
			chartId: 'test-chart-2'
		};
		const domain = resolveGeometryDomain('stacked-bar', [first, second]);
		expect(domain.y[1]).toBeGreaterThan(120);
		expect(domain.y[0]).toBeLessThan(-50);
	});

	it('retains explicit line gaps instead of connecting unrelated values', () => {
		const input: ChartSeriesRegistration = {
			chartId: 'test-chart',
			props: { id: 'exact' },
			data: new Map([
				['p50', { props: { id: 'p50', x: 'p50', value: 33 } }],
				['p75', { props: { id: 'p75', x: 'p75', value: 35, defined: false } }],
				['p99', { props: { id: 'p99', x: 'p99', value: 44 } }]
			])
		};
		const domain = resolveGeometryDomain('line', [input]);
		const points = positionSeries(input, domain, resolveChartLayout({ width: 640, height: 360 }));
		expect(linePath(points).match(/M/gu)).toHaveLength(2);
	});
});
