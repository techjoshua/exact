import { createDefaultIntlEnvironment } from '@exactjs/intl';
import { describe, expect, it } from 'vitest';
import type { ChartProps, ChartType } from './contracts.js';
import type { ChartCoordinator } from './contexts.js';
import { ChartModel } from './model.js';
import { createChartPresentation } from './presentation.js';

const families: readonly ChartType[] = [
	'line',
	'area',
	'bar',
	'horizontal-bar',
	'stacked-bar',
	'range'
];

describe('chart presentation', () => {
	it.each(families)('derives deterministic %s geometry and semantic rows', (type) => {
		const chart = coordinator(type);
		const presentation = createChartPresentation(
			chart,
			createDefaultIntlEnvironment('en-US'),
			undefined,
			undefined,
			0,
			0,
			0
		);

		expect(presentation.rows).toHaveLength(2);
		expect(presentation.marks).toHaveLength(2);
		expect(
			presentation.lines.length + presentation.bars.length + presentation.ranges.length
		).toBeGreaterThan(0);
		expect(presentation.orientation).toBe(
			type === 'horizontal-bar' || type === 'range' ? 'horizontal' : 'vertical'
		);
	});

	it('places range statistics on a numeric horizontal axis', () => {
		const presentation = createChartPresentation(
			coordinator('range'),
			undefined,
			undefined,
			undefined,
			0,
			0,
			undefined
		);

		expect(presentation.ticks.every((tick) => tick.x >= presentation.layout.left)).toBe(true);
		expect(presentation.categories.map((category) => category.value)).toEqual([
			'Exact',
			'TanStack Start'
		]);
		expect(presentation.layout.left).toBeGreaterThan(100);
		expect(presentation.ranges[0]?.marks.map((mark) => mark.name)).toEqual(['P75', 'P95']);
		expect(presentation.ranges[0]?.label).toContain('P75:');
		expect(presentation.rows[0]?.value).toContain('P95:');
	});

	it('delegates measurement conversion and formatting to the active intl environment', () => {
		const environment = createDefaultIntlEnvironment('de-DE');
		environment.setUnitPreferences({ 'temperature/weather': 'celsius' });
		const presentation = createChartPresentation(
			coordinator('bar', { measurement: true }),
			environment,
			undefined,
			undefined,
			0,
			0,
			environment.state.generation
		);

		expect(presentation.measurement?.destinationUnits).toEqual(['celsius']);
		expect(presentation.rows[0]?.value).toContain('°C');
	});

	it('rejects missing axes, reversed domains, and non-finite values', () => {
		const missing = coordinator('line', { missingAxis: true });
		expect(() => present(missing)).toThrow(/missing axis/u);

		const reversed = coordinator('line', { reversedDomain: true });
		expect(() => present(reversed)).toThrow(/domain must increase/u);

		const nonFinite = coordinator('line', { nonFinite: true });
		expect(() => present(nonFinite)).toThrow(/must be finite/u);
	});
});

function present(chart: ChartCoordinator) {
	return createChartPresentation(chart, undefined, undefined, undefined, 0, 0, undefined);
}

function coordinator(
	type: ChartType,
	options: {
		readonly missingAxis?: boolean;
		readonly reversedDomain?: boolean;
		readonly nonFinite?: boolean;
		readonly measurement?: boolean;
	} = {}
): ChartCoordinator {
	const props: ChartProps = { type, width: 640, height: 320 };
	const model = new ChartModel();
	model.seed(
		'test-chart',
		[
			{ id: 'category', position: 'bottom', scale: 'category' },
			{
				id: 'value',
				position: 'left',
				scale: 'linear',
				...(options.measurement
					? {
							measurement: {
								quantity: 'temperature',
								usage: 'weather',
								sourceUnit: 'fahrenheit' as const
							}
						}
					: {}),
				...(options.reversedDomain ? { domain: [10, 0] as const } : {})
			}
		],
		[
			{
				id: 'current',
				label: 'Current',
				xAxis: options.missingAxis ? 'missing' : 'category',
				yAxis: 'value',
				data: [
					{
						id: 'exact',
						label: 'Exact',
						x: 'Exact',
						value: options.nonFinite ? Number.NaN : 33,
						minimum: 28,
						maximum: 42,
						marks: { P75: 35, P95: 39 }
					},
					{
						id: 'react',
						label: 'TanStack Start',
						x: 'TanStack Start',
						value: 41,
						minimum: 37,
						maximum: 49,
						marks: { P75: 43, P95: 47 }
					}
				]
			}
		]
	);
	return {
		id: 'test-chart',
		props,
		model,
		changed: () => model.changed(),
		get revision() {
			return model.revision;
		}
	};
}
