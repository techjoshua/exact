import { performance } from 'node:perf_hooks';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createBunRenderPolicy } from './render-policy.js';

afterEach(() => {
	vi.restoreAllMocks();
});

it('retains adaptive string policy while streaming shares a work window across requests', async () => {
	let now = 0;
	vi.spyOn(performance, 'now').mockImplementation(() => now);
	const gate = { shouldSchedule: vi.fn(() => false) };
	const enqueue = vi.fn(() => Promise.resolve());
	const host = createBunRenderPolicy(gate, enqueue);
	const string = host;
	const stream = host.streaming!;
	expect(string).toBe(host);
	expect(host.streaming).toBe(stream);
	expect(string()).toBeUndefined();
	expect(stream(new AbortController().signal)).toBeUndefined();
	now = 0.6;
	await stream(new AbortController().signal);
	expect(enqueue).toHaveBeenCalledTimes(1);
	// A resolved continuation alone does not prove that another event-loop turn occurred.
	await stream();
	expect(enqueue).toHaveBeenCalledTimes(2);
	await nextTurn();
	expect(stream()).toBeUndefined();
	expect(string()).toBeUndefined();
	expect(gate.shouldSchedule).toHaveBeenCalledTimes(2);
	await nextTurn();
});

it('preserves adaptive admission decisions and rejects cancelled streaming work before enqueueing', async () => {
	const gate = { shouldSchedule: () => true };
	const enqueue = vi.fn(() => Promise.resolve());
	const host = createBunRenderPolicy(gate, enqueue);
	await host();
	expect(enqueue).toHaveBeenCalledTimes(1);
	const abort = new AbortController();
	const reason = new Error('disconnected');
	abort.abort(reason);
	expect(() => host.streaming!(abort.signal)).toThrow(reason);
	expect(enqueue).toHaveBeenCalledTimes(1);
});
