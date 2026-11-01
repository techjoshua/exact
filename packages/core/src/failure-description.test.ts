import { expect, it } from 'vitest';
import { describeFailureReason } from './failure-description.js';
import { formatError } from './component/log.js';

it('preserves ordinary failure descriptions and contains hostile conversion', () => {
	for (const value of [null, false, 0, 'failure', Symbol('failure')])
		expect(describeFailureReason(value, 'fallback')).toBe(String(value));
	expect(describeFailureReason(undefined, 'fallback')).toBe('fallback');
	const hostile = {
		get toString(): never {
			throw new Error('conversion');
		}
	};
	expect(describeFailureReason(hostile, 'fallback')).toBe('fallback');
	expect(formatError(hostile)).toBe('Unknown error');
});

it('keeps native error stacks and contains hostile error getters and prototypes', () => {
	const original = new Error('original');
	expect(formatError(original)).toBe(original.stack);
	const message = Object.defineProperty(new Error('message'), 'stack', {
		get(): never {
			throw new Error('stack');
		}
	});
	expect(formatError(message)).toBe('Unknown error');
	const prototype = new Proxy(
		{},
		{
			getPrototypeOf(): never {
				throw new Error('prototype');
			}
		}
	);
	expect(formatError(prototype)).toBe('Unknown error');
});
