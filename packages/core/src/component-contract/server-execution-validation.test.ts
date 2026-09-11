import { expect, it } from 'vitest';
import { isExactServerExecutionMetadata } from './server-execution-validation.js';

it('accepts only a direct component document proof', () => {
	const execution = {
		version: 1,
		classification: 'scheduled',
		lane: 'direct',
		render() {},
		documentRoot: true
	};
	expect(isExactServerExecutionMetadata(execution)).toBe(true);
	expect(isExactServerExecutionMetadata({ ...execution, streamingDocument: true })).toBe(true);
	expect(
		isExactServerExecutionMetadata({
			...execution,
			streamingDocument: true,
			documentRoot: undefined
		})
	).toBe(false);
	expect(
		isExactServerExecutionMetadata({
			...execution,
			streamingDocument: true,
			classification: 'synchronous'
		})
	).toBe(false);
	for (const documentRoot of [false, 'html', 1, {}])
		expect(isExactServerExecutionMetadata({ ...execution, documentRoot })).toBe(false);
	expect(isExactServerExecutionMetadata({ ...execution, render: undefined }, true)).toBe(false);
	expect(isExactServerExecutionMetadata({ ...execution, lane: 'compatibility' })).toBe(false);
});
