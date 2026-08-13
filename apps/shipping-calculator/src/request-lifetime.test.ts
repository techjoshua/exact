import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createParcelRequestLifetime } from './request-lifetime.js';

describe('shipping request lifetime', () => {
	it('releases disconnect listeners and aborts its signal on successful disposal', () => {
		const request = new EventEmitter();
		const response = Object.assign(new EventEmitter(), { writableEnded: true });
		const lifetime = createParcelRequestLifetime(request, response);

		lifetime.dispose();

		expect(lifetime.signal.aborted).toBe(true);
		expect(request.listenerCount('aborted')).toBe(0);
		expect(response.listenerCount('close')).toBe(0);
	});

	it('aborts when the response closes before completion', () => {
		const request = new EventEmitter();
		const response = Object.assign(new EventEmitter(), { writableEnded: false });
		const lifetime = createParcelRequestLifetime(request, response);

		response.emit('close');

		expect(lifetime.signal.aborted).toBe(true);
		expect(lifetime.signal.reason).toMatchObject({ name: 'AbortError' });
		lifetime.dispose();
		expect(request.listenerCount('aborted')).toBe(0);
		expect(response.listenerCount('close')).toBe(0);
	});
});
