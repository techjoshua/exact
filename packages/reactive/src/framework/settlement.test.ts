import { describe, expect, it, vi } from 'vitest';
import { reactive, watch } from '../index.js';
import { afterReactiveSettlement } from './settlement.js';

describe('reactive settlement', () => {
	it('runs once after consequences of the current invalidation settle', async () => {
		const state = reactive({ value: 0 });
		const order: string[] = [];
		watch(() => {
			order.push(`render:${state.value}`);
		});

		state.value = 1;
		const reconcile = vi.fn(() => order.push('settled'));
		afterReactiveSettlement(reconcile);
		afterReactiveSettlement(reconcile);
		await Promise.resolve();

		expect(order).toEqual(['render:0', 'render:1', 'settled']);
		expect(reconcile).toHaveBeenCalledTimes(1);
	});

	it('defers a request made during settlement to a later turn', async () => {
		const order: string[] = [];
		afterReactiveSettlement(() => {
			order.push('first');
			afterReactiveSettlement(() => order.push('second'));
		});

		await Promise.resolve();
		expect(order).toEqual(['first']);
		await Promise.resolve();
		expect(order).toEqual(['first', 'second']);
	});
});
