import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import { beforeEach, expect, it, vi } from 'vitest';
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
