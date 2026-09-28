import { expect, it } from 'vitest';
import { ImmediateAdmissionProbe } from './admission-probe.js';

it('stops further immediate starts after the turn budget and releases the callback', () => {
	let canceled = 0;
	const probe = new ImmediateAdmissionProbe(() => () => {
		canceled++;
	});
	expect(probe.observe(100)).toBe(true);
	expect(probe.observe(107.9)).toBe(true);
	expect(probe.observe(108)).toBe(false);
	expect(canceled).toBe(1);
	probe.reset();
	expect(canceled).toBe(1);
	expect(probe.observe(200)).toBe(true);
	probe.reset();
	expect(canceled).toBe(2);
});

it('renews the budget after a host turn without retaining or canceling its completed callback', () => {
	let next!: () => void;
	let canceled = 0;
	let scheduled = 0;
	const probe = new ImmediateAdmissionProbe((reset) => {
		scheduled++;
		next = reset;
		return () => {
			canceled++;
		};
	});
	expect(probe.observe(0)).toBe(true);
	expect(probe.observe(7)).toBe(true);
	expect(scheduled).toBe(1);
	next();
	expect(probe.observe(100)).toBe(true);
	expect(probe.observe(107)).toBe(true);
	expect(scheduled).toBe(2);
	probe.reset();
	expect(canceled).toBe(1);
});
