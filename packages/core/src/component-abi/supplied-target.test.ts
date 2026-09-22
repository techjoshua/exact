import { describe, expect, it } from 'vitest';
import { createCompiledFragmentReceipt } from './fragment-receipt.js';
import {
	createCompiledSuppliedTargetReceipt,
	readCompiledTargetReceipt
} from './target-receipt.js';

describe('supplied logical target', () => {
	it('preserves explicit fragments, including an empty fragment, as one logical child', () => {
		for (const fragment of [
			createCompiledFragmentReceipt(null),
			createCompiledFragmentReceipt(null, 'a', 'b')
		]) {
			const target = readCompiledTargetReceipt(
				createCompiledSuppliedTargetReceipt({ title: undefined }, fragment)
			)!;
			expect(target.children).toEqual([fragment]);
			expect(Object.hasOwn(target.props, 'title')).toBe(true);
		}
	});
	it('rejects several independently supplied children instead of mounting the first one', () => {
		expect(() => createCompiledSuppliedTargetReceipt(null, ['a', ['b']])).toThrow(
			/one logical child/
		);
		expect(
			readCompiledTargetReceipt(createCompiledSuppliedTargetReceipt(null, [null, ['a'], false]))
				?.children
		).toEqual(['a']);
	});
	it('keeps an absent supplied child empty', () => {
		expect(
			readCompiledTargetReceipt(createCompiledSuppliedTargetReceipt(null, []))?.children
		).toEqual([undefined]);
	});
});
