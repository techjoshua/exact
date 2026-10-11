import { expect, it } from 'vitest';
import { ExactViteDevelopmentUpdates } from './development-updates.js';

it('settles one complete update before starting another and recovers after rejection', async () => {
	const updates = new ExactViteDevelopmentUpdates();
	const order: string[] = [];
	let release!: () => void;
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const first = updates.run(async () => {
		order.push('first-start');
		await gate;
		order.push('first-end');
		throw new Error('invalid change');
	});
	const rejected = expect(first).rejects.toThrow('invalid change');
	const second = updates.run(async () => {
		order.push('second');
		return 'recovered';
	});
	await Promise.resolve();
	expect(order).toEqual(['first-start']);
	release();
	await rejected;
	await expect(second).resolves.toBe('recovered');
	expect(order).toEqual(['first-start', 'first-end', 'second']);
});
