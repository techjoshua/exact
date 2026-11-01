import { describe, expect, it } from 'vitest';
import {
	patchValidationCases,
	collectionValidationCases
} from '../../core/src/test-support/operation-validation-cases.js';
import { isInvocationResultSafe } from './validation.js';

describe('server response protocol shapes', () => {
	it.each(patchValidationCases)('patch: $name', ({ value, valid }) => {
		expect(isInvocationResultSafe({ patches: [value] })).toBe(valid);
	});
	it.each(collectionValidationCases)('collection: $name', ({ value, valid }) => {
		expect(isInvocationResultSafe({ mutations: [value] })).toBe(valid);
	});
	it.each([
		null,
		false,
		1,
		'result',
		[],
		{ extra: true },
		{ contexts: null },
		{ contexts: [] },
		{ contexts: 'context' },
		{ patches: {} },
		{ mutations: {} },
		{ html: 1 }
	])('rejects an invalid result envelope %#', (value) => {
		expect(isInvocationResultSafe(value)).toBe(false);
	});
	it('accepts omitted optional fields and bounds patch counts at the limit', () => {
		expect(isInvocationResultSafe({})).toBe(true);
		expect(isInvocationResultSafe({ contexts: {}, html: '', value: null })).toBe(true);
		const patch = { type: 'text', id: 'target', value: '' };
		expect(isInvocationResultSafe({ patches: [patch] }, { maxPatches: 1 })).toBe(true);
		expect(() =>
			isInvocationResultSafe({ patches: [{ ...patch }, { ...patch }] }, { maxPatches: 1 })
		).toThrow(/maxPatches: actual 2 patches, configured cap 1 patches/);
	});
});
