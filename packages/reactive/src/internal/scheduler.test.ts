import { describe, expect, it, vi } from 'vitest';
import { flushSync, queueComputation } from './scheduler.js';

describe('reactive scheduler computation errors', () => {
	it('routes each queued computation failure to the handler retained with that computation', () => {
		const first = new Error('first');
		const second = new Error('second');
		const firstHandler = vi.fn();
		const secondHandler = vi.fn();
		queueComputation(() => {
			throw first;
		}, firstHandler);
		queueComputation(() => {
			throw second;
		}, secondHandler);

		expect(() => flushSync()).not.toThrow();
		expect(firstHandler).toHaveBeenCalledWith(first);
		expect(secondHandler).toHaveBeenCalledWith(second);
	});

	it('continues draining and rethrows the first unhandled computation failure', () => {
		const ran = vi.fn();
		queueComputation(() => {
			throw new Error('unhandled');
		});
		queueComputation(ran);

		expect(() => flushSync()).toThrow('unhandled');
		expect(ran).toHaveBeenCalledOnce();
	});
});
