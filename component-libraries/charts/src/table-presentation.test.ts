import { describe, expect, it } from 'vitest';
import { createDefaultIntlEnvironment, resolveIntlMeasurementPresentation } from '@exactjs/intl';
import { ChartModel } from './model.js';
import type { ChartSeriesInput } from './contracts.js';
import type { ChartTableOptions } from './table-contracts.js';
import { presentChartTable } from './table-presentation.js';

function table(options: ChartTableOptions, series: readonly ChartSeriesInput[]) {
	const model = new ChartModel();
	model.seed('table', [], series);
	return presentChartTable(options, [...model.series.values()], undefined, undefined);
}
const heap: readonly ChartSeriesInput[] = [
	{
		id: 'code',
		label: 'Code',
		data: [
			{ id: 'a', x: 'A', value: 0.004 },
			{ id: 'b', x: 'B', value: 0 }
		]
	},
	{
		id: 'objects',
		label: 'Objects',
		data: [
			{ id: 'a', x: 'A', value: 0.004 },
			{ id: 'b', x: 'B', value: 5, defined: false }
		]
	}
];

describe('chart-owned table projection', () => {
	it('combines series/category labels and presents complete ordered ranges', () => {
		const options = {
			layout: 'values',
			rowLabel: 'series-category',
			precision: 2,
			columns: [{ label: 'P95', field: 'minimum', rangeEnd: 'maximum' }]
		} as const;
		const series = [
			{
				id: 'a',
				label: 'A',
				data: [
					{ id: 'one', x: '16 in flight', value: 10, minimum: 0, maximum: 2 },
					{ id: 'two', x: '32 in flight', value: 20, minimum: 1 },
					{ id: 'three', x: '64 in flight', value: 30, minimum: 1, maximum: 1.001 }
				]
			}
		];
		const result = table(options, series);
		expect(result.rows.map((row) => [row.label, row.cells[0]!.value])).toEqual([
			['A / 16 in flight', '0.00–2.00'],
			['A / 32 in flight', 'Not available'],
			['A / 64 in flight', '1.00']
		]);
		expect(() =>
			table(options, [{ id: 'a', data: [{ id: 'bad', x: 1, value: 1, minimum: 2, maximum: 1 }] }])
		).toThrow(/ordered/);
	});
	it('pivots both ways, totals unrounded values, and distinguishes missing entries from zero', () => {
		const result = table({ layout: 'categories', precision: 2, total: { label: 'Total' } }, heap);
		expect(result.columns.map((c) => c.label)).toEqual(['Code', 'Objects', 'Total']);
		expect(result.rows.map((r) => r.cells.map((c) => c.value))).toEqual([
			['0.00', '0.00', '0.01'],
			['0.00', 'Not available', 'Not available']
		]);
		const transposed = table(
			{
				layout: 'series',
				precision: 3,
				categories: [{ value: 'B', label: 'Second' }],
				seriesOrder: ['objects']
			},
			heap
		);
		expect(transposed.columns.map((c) => c.label)).toEqual(['Second', 'A']);
		expect(transposed.rows.map((r) => [r.label, ...r.cells.map((c) => c.value)])).toEqual([
			['Objects', 'Not available', '0.004'],
			['Code', '0.000', '0.004']
		]);
		expect(heap[0]!.data[0]!.value).toBe(0.004);
	});

	it('uses explicit endpoint and statistic fields, without substituting the primary value for a missing endpoint', () => {
		const result = table(
			{
				layout: 'values',
				rowLabel: 'series',
				unit: 'ms',
				columns: [
					{ label: 'Mean', field: { statistic: 'mean' } },
					{ label: 'P50', field: 'minimum' },
					{ label: 'P75', field: { mark: 'P75' } },
					{ label: 'P99', field: 'maximum' }
				]
			},
			[
				{
					id: 'a',
					label: 'A',
					data: [
						{
							id: 'sample',
							x: 'latency',
							value: 99,
							minimum: 2,
							marks: { P75: 4 },
							statistics: { mean: 5 }
						}
					]
				}
			]
		);
		expect(result.columns.map((c) => c.label)).toEqual([
			'Mean (ms)',
			'P50 (ms)',
			'P75 (ms)',
			'P99 (ms)'
		]);
		expect(result.rows[0]!.label).toBe('A');
		expect(result.rows[0]!.cells.map((c) => c.value)).toEqual(['5', '2', '4', 'Not available']);
	});

	it('keeps typed coordinates distinct and rejects ambiguous matrix cells and invalid ordering', () => {
		const data = [
			{ id: 'n', x: 1, value: 1 },
			{ id: 's', x: '1', value: 2 }
		];
		expect(table({ layout: 'categories' }, [{ id: 'a', data }]).rows).toHaveLength(2);
		expect(() =>
			table({ layout: 'categories' }, [
				{ id: 'a', data: [...data, { id: 'duplicate', x: 1, value: 9 }] }
			])
		).toThrow('duplicate category');
		for (const seriesOrder of [['missing'], ['code', 'code']])
			expect(() => table({ layout: 'series', seriesOrder }, heap)).toThrow(/unknown|duplicate/);
		expect(() => table({ layout: 'series', categories: [{ value: 'missing' }] }, heap)).toThrow(
			'unknown'
		);
		expect(() => table({ layout: 'categories', precision: 21 }, heap)).toThrow('precision');
		expect(() => table({ layout: 'categories', precision: 2, numberFormat: {} }, heap)).toThrow(
			'either'
		);
	});

	it('does not treat an absent series/category pair as zero or sum incompatible fields implicitly', () => {
		const result = table(
			{ layout: 'categories', total: { label: 'Total' }, missing: 'Not measured' },
			[
				{ id: 'a', data: [{ id: 'a', x: 'A', value: 0 }] },
				{ id: 'b', data: [{ id: 'b', x: 'B', value: 3 }] }
			]
		);
		expect(result.rows.map((r) => r.cells.map((c) => c.value))).toEqual([
			['0', 'Not measured', 'Not measured'],
			['Not measured', '3', 'Not measured']
		]);
		expect(table({ layout: 'series' }, []).rows).toEqual([]);
		expect(() =>
			table({ layout: 'categories', total: { label: 'Total' } }, [
				{ id: 'a', data: [{ id: 'x', x: 'X', value: Number.MAX_VALUE }] },
				{ id: 'b', data: [{ id: 'x', x: 'X', value: Number.MAX_VALUE }] }
			])
		).toThrow('finite');
	});

	it('formats cells and totals through the same measurement conversion as the chart', () => {
		const environment = createDefaultIntlEnvironment('en-US');
		environment.setUnitPreferences({ 'length/person-height': ['foot', 'inch'] });
		const measurement = resolveIntlMeasurementPresentation(environment, {
			quantity: 'length',
			usage: 'person-height',
			sourceUnit: 'centimeter',
			unitComposition: 'single',
			convertTo: 'auto',
			values: [30.48, 60.96]
		});
		const model = new ChartModel();
		model.seed(
			'units',
			[],
			[
				{ id: 'a', data: [{ id: 'x', x: 'X', value: 30.48 }] },
				{ id: 'b', data: [{ id: 'x', x: 'X', value: 60.96 }] }
			]
		);
		const result = presentChartTable(
			{ layout: 'categories', precision: 2, unit: 'ft', total: { label: 'Total' } },
			[...model.series.values()],
			measurement,
			environment
		);
		expect(result.rows[0]!.cells.map((cell) => cell.value)).toEqual(['1.00', '2.00', '3.00']);
	});

	it('uses the active locale for fixed precision and explicit number formatting', () => {
		const model = new ChartModel();
		model.seed('locale', [], [{ id: 'a', data: [{ id: 'x', x: 'X', value: 1234.5 }] }]);
		const series = [...model.series.values()];
		const environment = createDefaultIntlEnvironment('de-DE');
		expect(
			presentChartTable({ layout: 'series', precision: 2 }, series, undefined, environment).rows[0]!
				.cells[0]!.value
		).toBe('1234,50');
		expect(
			presentChartTable(
				{ layout: 'series', numberFormat: { maximumFractionDigits: 2 } },
				series,
				undefined,
				environment
			).rows[0]!.cells[0]!.value
		).toBe('1.234,5');
		expect(
			table({ layout: 'series', numberFormat: { maximumFractionDigits: 2 } }, [
				{ id: 'a', data: [{ id: 'x', x: 'X', value: 1234.5 }] }
			]).rows[0]!.cells[0]!.value
		).toBe('1,234.5');
	});
});
