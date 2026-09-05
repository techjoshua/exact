import { describe, expect, it } from 'vitest';
import { isExactServerExecutionMetadata } from './server-execution-validation.js';

describe('server execution validation', () => {
	it('accepts a compiler-proven direct synchronous executor', () => {
		expect(
			isExactServerExecutionMetadata({
				version: 1,
				classification: 'synchronous',
				lane: 'direct',
				mode: 'direct',
				render: () => null
			})
		).toBe(true);
		expect(
			isExactServerExecutionMetadata({
				version: 1,
				classification: 'synchronous',
				lane: 'direct',
				mode: 'stateless',
				render: () => null
			})
		).toBe(true);
	});

	it('rejects direct mode on scheduled and selection artifacts', () => {
		const metadata = {
			version: 1,
			classification: 'scheduled',
			lane: 'direct',
			mode: 'direct',
			render: () => null
		};

		expect(isExactServerExecutionMetadata(metadata)).toBe(false);
		expect(
			isExactServerExecutionMetadata(
				{ ...metadata, classification: 'synchronous', render: undefined },
				true
			)
		).toBe(false);
	});
});
