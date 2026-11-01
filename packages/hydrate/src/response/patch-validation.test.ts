import { describe, expect, it } from 'vitest';
import { encodeReactiveProtocolValue } from '@exactjs/core';
import {
	patchValidationCases,
	collectionValidationCases
} from '../../../core/src/test-support/operation-validation-cases.js';
import { parseExactInvocationResponse } from './json.js';
import { isExactStreamPatchEvent, isExactStreamMutationsEvent } from './events.js';

const identity = { type: 'invoke' as const, id: 'operation', opId: 'generation' };

describe('client response protocol shapes', () => {
	it('decodes shared response siblings without retaining transport identity', () => {
		const shared = { count: 1 };
		const value = { left: shared, right: shared };
		const result = parseExactInvocationResponse(
			{ ok: true, ...identity, value },
			'invalid',
			identity
		);
		expect(result.value).toEqual(value);
		const decoded = result.value as typeof value;
		expect(decoded.left).not.toBe(decoded.right);
	});
	it.each(patchValidationCases)('buffered and streamed patch: $name', ({ value, valid }) => {
		const response = encodeReactiveProtocolValue({ ok: true, ...identity, patches: [value] });
		if (valid)
			expect(parseExactInvocationResponse(response, 'invalid', identity).patches).toEqual([value]);
		else
			expect(() => parseExactInvocationResponse(response, 'invalid', identity)).toThrow('invalid');
		expect(
			isExactStreamPatchEvent({ event: 'patch', version: 1, index: 0, ...identity, patch: value })
		).toBe(valid);
	});
	it.each(collectionValidationCases)(
		'buffered and streamed collection: $name',
		({ value, valid }) => {
			const response = { ok: true, ...identity, mutations: [value] };
			if (valid)
				expect(parseExactInvocationResponse(response, 'invalid', identity).mutations).toEqual([
					value
				]);
			else
				expect(() => parseExactInvocationResponse(response, 'invalid', identity)).toThrow(
					'invalid'
				);
			expect(
				isExactStreamMutationsEvent({
					event: 'mutations',
					version: 1,
					index: 0,
					...identity,
					mutations: [value]
				})
			).toBe(valid);
		}
	);
});
