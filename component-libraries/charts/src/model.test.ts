import { describe, expect, it, vi } from 'vitest';
import { ChartModel } from './model.js';

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
