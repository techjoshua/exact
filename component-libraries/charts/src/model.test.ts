import { describe, expect, it, vi } from 'vitest';
import { ChartModel, projectChartInputs, type ChartSeriesRegistration } from './model.js';
import type { ChartProps } from './contracts.js';

describe('chart model ownership', () => {
	it('rejects duplicate registrations and releases only the owned value', () => {
		const model = new ChartModel();
		const changed = vi.fn();
		const detach = model.attachInvalidator(changed);
		const first = { props: { id: 'value', position: 'left' as const } };
		model.registerAxis(first);

		expect(() =>
			model.registerAxis({ props: { id: 'value', position: 'right' as const } })
		).toThrow(/Duplicate chart axis ID/u);
		model.unregisterAxis(first);
		expect(model.axes.has('value')).toBe(false);
		expect(changed).toHaveBeenCalledTimes(2);

		detach();
		model.registerAxis({ props: { id: 'other', position: 'bottom' } });
		expect(changed).toHaveBeenCalledTimes(2);
	});

	it('copies compact registrations without retaining caller arrays', () => {
		const axes = [{ id: 'category', position: 'bottom' as const }];
		const data = [{ id: 'one', x: 'One', value: 1 }];
		const series = [{ id: 'current', data }];
		const model = new ChartModel();
		model.seed('chart', axes, series);

		axes.length = 0;
		data.length = 0;
		series.length = 0;
		expect([...model.axes]).toHaveLength(1);
		expect([...model.series.get('current')!.data]).toHaveLength(1);
	});
});

describe('current compact input projection', () => {
	it('reads replacement membership and labels while preserving registered identities and order', () => {
		const model = new ChartModel();
		const declared: ChartSeriesRegistration = {
			chartId: 'chart',
			props: { id: 'declared' },
			data: new Map()
		};
		model.registerSeries(declared);
		const datum = { id: 'a', x: 'A', value: 1 };
		const props: ChartProps = {
			type: 'bar',
			series: [{ id: 'compact', label: 'Before', data: [datum] }]
		};
		const chart = { id: 'chart', props, model };
		const first = projectChartInputs(chart);
		expect([...first.model.series.keys()]).toEqual(['compact', 'declared']);
		expect(first.model.series.get('declared')).toBe(declared);
		expect(first.model.series.get('compact')?.data.get('a')?.props).toBe(datum);
		expect(model.series.size).toBe(1);
		expect(() => datum.value++).not.toThrow();
		expect(first.model.series.get('compact')?.data.get('a')?.props.value).toBe(2);
		const replacement = { id: 'b', x: 'B', value: 7 };
		const next = projectChartInputs({
			...chart,
			props: { type: 'bar', series: [{ id: 'compact', label: 'After', data: [replacement] }] }
		});
		expect(next.model.series.get('compact')?.textLabel).toBe('After');
		expect([...next.model.series.get('compact')!.data.keys()]).toEqual(['b']);
		expect(next.model.series.get('declared')).toBe(declared);
		expect(model.series.get('declared')).toBe(declared);
	});

	it('refuses cross-source and datum collisions before changing live registrations', () => {
		const model = new ChartModel();
		const declared: ChartSeriesRegistration = {
			chartId: 'chart',
			props: { id: 'same' },
			data: new Map()
		};
		model.registerSeries(declared);
		const revision = model.revision;
		expect(() =>
			projectChartInputs({
				id: 'chart',
				model,
				props: { type: 'bar', series: [{ id: 'same', data: [] }] }
			})
		).toThrow('Duplicate chart series ID same');
		expect(() =>
			projectChartInputs({
				id: 'chart',
				model,
				props: {
					type: 'bar',
					series: [
						{
							id: 'compact',
							data: [
								{ id: 'a', x: 'A', value: 1 },
								{ id: 'a', x: 'B', value: 2 }
							]
						}
					]
				}
			})
		).toThrow('Duplicate chart datum ID a');
		expect([...model.series.values()]).toEqual([declared]);
		expect(model.revision).toBe(revision);
		const valid = projectChartInputs({
			id: 'chart',
			model,
			props: { type: 'bar', series: [{ id: 'valid', data: [] }] }
		});
		expect([...valid.model.series.keys()]).toEqual(['valid', 'same']);
	});

	it('keeps current compact axes shared by labels and domain lookup', () => {
		const model = new ChartModel();
		const props: ChartProps = {
			type: 'bar',
			axes: [{ id: 'y', position: 'left', label: 'Now', domain: [0, 10] }]
		};
		const projected = projectChartInputs({ id: 'chart', model, props });
		expect(projected.model.axes.get('y')?.textLabel).toBe('Now');
		expect(projected.model.axes.get('y')?.props.domain).toEqual([0, 10]);
		expect(model.axes.size).toBe(0);
		expect(() =>
			projectChartInputs({
				id: 'chart',
				model,
				props: { type: 'bar', axes: [{ id: ' ', position: 'left' }] }
			})
		).toThrow('ID cannot be empty');
	});

	it('drops removed compact entries without changing declaration cleanup ownership', () => {
		const model = new ChartModel();
		const declared: ChartSeriesRegistration = {
			chartId: 'chart',
			props: { id: 'declared' },
			data: new Map()
		};
		model.registerSeries(declared);
		projectChartInputs({
			id: 'chart',
			model,
			props: { type: 'bar', series: [{ id: 'compact', data: [] }] }
		});
		const empty = projectChartInputs({ id: 'chart', model, props: { type: 'bar', series: [] } });
		expect([...empty.model.series.keys()]).toEqual(['declared']);
		model.unregisterSeries({ ...declared });
		expect(model.series.get('declared')).toBe(declared);
		model.unregisterSeries(declared);
		expect(model.series.size).toBe(0);
	});

	it('preserves direct seed prefix registration and duplicate failure timing', () => {
		const model = new ChartModel();
		expect(() =>
			model.seed(
				'chart',
				[],
				[
					{
						id: 's',
						data: [
							{ id: 'a', x: 'A', value: 1 },
							{ id: 'a', x: 'B', value: 2 }
						]
					}
				]
			)
		).toThrow('Duplicate chart datum ID a');
		expect(model.series.get('s')?.data.get('a')?.props.value).toBe(1);
		expect(model.revision).toBe(2);
	});
});
