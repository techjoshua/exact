import { describe, expect, it, vi } from 'vitest';
import { computed } from '@exactjs/reactive';
import { createCompiledFragmentReceipt } from './fragment-receipt.js';
import {
	createCompiledSuppliedTargetReceipt,
	createCompiledTargetReceipt,
	createCompiledTargetContributions,
	withCompiledTargetPresentation,
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
	it('retains the already sampled raw input only through compiler-issued supplied targets', () => {
		const child = createCompiledFragmentReceipt(null, 'owned');
		let elementReads = 0;
		const input: unknown[] = [];
		Object.defineProperty(input, 0, {
			get() {
				elementReads++;
				return child;
			},
			enumerable: true
		});
		input.length = 1;
		const operation = createCompiledSuppliedTargetReceipt(null, input);
		const data = readCompiledTargetReceipt(operation)!;
		expect(elementReads).toBe(2);
		expect(data.suppliedInput?.value).toBe(input);
		expect(data.children).toEqual([child]);
		expect(
			readCompiledTargetReceipt(withCompiledTargetPresentation(operation, child))?.suppliedInput
				?.value
		).toBe(input);
		expect(
			readCompiledTargetReceipt(createCompiledTargetContributions([], operation))?.suppliedInput
				?.value
		).toBe(input);
		expect(elementReads).toBe(2);
		expect(
			Object.hasOwn(
				readCompiledTargetReceipt(createCompiledSuppliedTargetReceipt(null, undefined))!,
				'suppliedInput'
			)
		).toBe(true);
		expect(
			Object.hasOwn(
				readCompiledTargetReceipt(createCompiledTargetReceipt(null, child))!,
				'suppliedInput'
			)
		).toBe(false);
		expect(readCompiledTargetReceipt({ suppliedInput: { value: input } })).toBeUndefined();
		expect(() => withCompiledTargetPresentation({} as never, child)).toThrow(
			'compiler-issued source'
		);
	});
	it('does not unwrap a reactive supplied input again to retain or copy its identity fact', () => {
		const child = createCompiledFragmentReceipt(null, 'owned'),
			input = computed(() => child);
		const get = vi.spyOn(input, 'get');
		try {
			const operation = createCompiledSuppliedTargetReceipt(null, input);
			expect(readCompiledTargetReceipt(operation)?.suppliedInput?.value).toBe(input);
			expect(
				readCompiledTargetReceipt(withCompiledTargetPresentation(operation, child))?.suppliedInput
					?.value
			).toBe(input);
			expect(get).toHaveBeenCalledTimes(1);
		} finally {
			get.mockRestore();
		}
	});
});
