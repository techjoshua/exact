import { expect, it } from 'vitest';
import { StreamingRenderWorkWindow } from './streaming-work-window.js';

it('shares a bounded work window until the host observes another turn', async () => {
	const turns: Array<() => void> = [];
	const budget = new StreamingRenderWorkWindow((reset) => turns.push(reset));
	expect(turns).toHaveLength(0);
	expect(budget.shouldSchedule(10)).toBe(false);
	expect(budget.shouldSchedule(10.49)).toBe(false);
	expect(budget.shouldSchedule(10.5)).toBe(true);
	await Promise.resolve();
	expect(budget.shouldSchedule(11)).toBe(true);
	expect(turns).toHaveLength(1);
	turns.shift()!();
	expect(turns).toHaveLength(0);
	expect(budget.shouldSchedule(20)).toBe(false);
	expect(budget.shouldSchedule(20.5)).toBe(true);
	expect(turns).toHaveLength(1);
	turns.shift()!();
});
