import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { performance } from 'node:perf_hooks';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { requestRenderScheduler } from '@exactjs/server/framework/render-scheduling';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createNodeRequestAdmission } from './admission.js';

const gate = vi.hoisted(() => ({
	create: vi.fn(),
	request: vi.fn(),
	complete: vi.fn(),
	schedule: false
}));
vi.mock('./adaptive-gate.js', () => ({
	AdaptiveRequestGate: class {
		constructor() {
			gate.create();
		}
		observeRequest = gate.request;
		observeCompletion = gate.complete;
		shouldSchedule() {
			return gate.schedule;
		}
	}
}));
beforeEach(() => {
	vi.clearAllMocks();
	gate.request.mockReset().mockReturnValue(undefined);
	gate.schedule = false;
});
afterEach(() => vi.restoreAllMocks());

it('shares streaming work across requests while retaining adaptive buffered admission', async () => {
	let now = 0;
	vi.spyOn(performance, 'now').mockImplementation(() => now);
	const enter = createNodeRequestAdmission();
	const first = new AbortController();
	const second = new AbortController();
	enter(new EventEmitter() as ServerResponse, first.signal);
	enter(new EventEmitter() as ServerResponse, second.signal);
	const policy = requestRenderScheduler(first.signal)!;
	expect(requestRenderScheduler(second.signal)).toBe(policy);
	const stream = policy.streaming!;
	gate.schedule = true;
	expect(stream(first.signal)).toBeUndefined();
	const buffered = policy(first.signal);
	expect(buffered).toBeInstanceOf(Promise);
	now = 0.5;
	const queued = stream(second.signal);
	expect(queued).toBeInstanceOf(Promise);
	second.abort('closed');
	await expect(queued).rejects.toBe('closed');
	await buffered;
	await nextTurn();
	expect(stream(first.signal)).toBeUndefined();
	gate.schedule = false;
	now = 100;
	expect(stream(first.signal)).toBeUndefined();
	expect(() => stream(second.signal)).toThrow('closed');
	await nextTurn();
});

it('enables automatic admission by default while leaving sparse requests unobserved', () => {
	const enter = createNodeRequestAdmission();
	const response = new EventEmitter() as ServerResponse;
	expect(enter(response, new AbortController().signal)).toBeUndefined();
	expect(gate.create).toHaveBeenCalledOnce();
	expect(response.eventNames()).toEqual([]);
});

it('permits an explicit immediate policy without creating a controller', () => {
	const enter = createNodeRequestAdmission({ adaptive: false });
	expect(enter(new EventEmitter() as ServerResponse, new AbortController().signal)).toBeUndefined();
	expect(gate.create).not.toHaveBeenCalled();
});

it('applies admission only once when a page host dispatches to another Node handler', () => {
	const response = new EventEmitter() as ServerResponse;
	const signal = new AbortController().signal;
	createNodeRequestAdmission()(response, signal);
	createNodeRequestAdmission()(response, signal);
	expect(gate.request).toHaveBeenCalledOnce();
});

it('preserves an outer immediate override through nested Node handlers', () => {
	const response = new EventEmitter() as ServerResponse;
	const signal = new AbortController().signal;
	createNodeRequestAdmission({ adaptive: false })(response, signal);
	createNodeRequestAdmission()(response, signal);
	expect(gate.request).not.toHaveBeenCalled();
});

it('counts successful finish once and removes both completion listeners', () => {
	gate.request.mockReturnValue(7);
	const response = Object.assign(new EventEmitter(), { writableFinished: true }) as ServerResponse;
	createNodeRequestAdmission()(response, new AbortController().signal);
	response.emit('finish');
	response.emit('close');
	expect(gate.complete).toHaveBeenCalledExactlyOnceWith(7);
	expect(response.eventNames()).toEqual([]);
});

it('releases aborted response observations without crediting a completion', () => {
	gate.request.mockReturnValue(7);
	const response = new EventEmitter() as ServerResponse;
	createNodeRequestAdmission()(response, new AbortController().signal);
	response.emit('close');
	expect(gate.complete).not.toHaveBeenCalled();
	expect(response.eventNames()).toEqual([]);
});

it('rejects already-canceled requests before observing them', async () => {
	const controller = new AbortController();
	controller.abort('closed');
	await expect(
		createNodeRequestAdmission()(new EventEmitter() as ServerResponse, controller.signal)
	).rejects.toBe('closed');
	expect(gate.request).not.toHaveBeenCalled();
});
