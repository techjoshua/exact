import { expect, it } from 'vitest';
import { StreamingPolicySelection, type StreamingPolicySample } from './streaming-policy.js';

const sample = (rate: number, lag = 2): StreamingPolicySample => ({
	rate,
	lag,
	count: 1000,
	utilization: 1
});

function compare(policy: StreamingPolicySelection, now: number, rates: number[], lag = 2) {
	for (const [index, rate] of rates.entries())
		policy.observe(now + index * 750, sample(rate, lag), true);
}

it('selects full batching when it beats both budgeted controls and can later select the budget', () => {
	const policy = new StreamingPolicySelection();
	expect(policy.batched).toBe(false);
	compare(policy, 0, [3600, 10_000, 4200, 10_000, 3700]);
	expect(policy.batched).toBe(true);
	compare(policy, 30_000, [4000, 10_000, 4600, 10_000, 4100]);
	expect(policy.batched).toBe(false);
});

it('rejects changes in offered work and immaterial throughput gains', () => {
	for (const rates of [
		[3000, 0, 4000, 0, 4500],
		[4000, 0, 4050, 0, 4000]
	]) {
		const policy = new StreamingPolicySelection();
		compare(policy, 0, rates);
		expect(policy.batched).toBe(false);
	}
});

it('rejects a faster candidate with substantially worse event-loop lag', () => {
	const policy = new StreamingPolicySelection();
	policy.observe(0, sample(3000), true);
	policy.observe(750, sample(3000), true);
	policy.observe(1500, sample(4000, 8), true);
	policy.observe(2250, sample(3000), true);
	policy.observe(3000, sample(3000), true);
	expect(policy.batched).toBe(false);
});

it('restores the incumbent after interruption and resets selection when idle', () => {
	const policy = new StreamingPolicySelection();
	policy.observe(0, sample(3000), true);
	expect(policy.batched).toBe(true);
	policy.cancel();
	expect(policy.batched).toBe(false);
	compare(policy, 30_000, [3000, 0, 4000, 0, 3000]);
	expect(policy.batched).toBe(true);
	policy.reset();
	expect(policy.batched).toBe(false);
});

it('does not trial buffered, sparse, or responsive demand-limited traffic', () => {
	const policy = new StreamingPolicySelection();
	expect(policy.observe(0, sample(3000), false)).toBe(false);
	expect(policy.observe(1000, { ...sample(3000), count: 10 }, true)).toBe(false);
	expect(policy.observe(2000, { ...sample(3000), utilization: 0.5 }, true)).toBe(false);
	expect(policy.batched).toBe(false);
});

it('abandons an incomplete candidate when streaming stops or completions are insufficient', () => {
	for (const streaming of [false, true]) {
		const policy = new StreamingPolicySelection();
		policy.observe(0, sample(3000), true);
		expect(policy.batched).toBe(true);
		expect(policy.observe(750, { ...sample(5000), count: streaming ? 10 : 1000 }, streaming)).toBe(
			false
		);
		expect(policy.batched).toBe(false);
		expect(policy.observe(1500, sample(5000), true)).toBe(false);
	}
});
