/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { createCompiledIntrinsicReceipt } from '@exactjs/core/runtime/component-operations';
import { adoptCoalescedScalarTextRun } from './scalar-text-run.js';

it('validates the whole run before splitting server text', () => {
	const host = document.createElement('p');
	const original = document.createTextNode('abc');
	host.append(original);
	expect(adoptCoalescedScalarTextRun(['a', 'wrong'], 0, original, 'a')).toBeUndefined();
	expect(host.childNodes).toHaveLength(1);
	expect(original.data).toBe('abc');
	expect(adoptCoalescedScalarTextRun(['abcd', ''], 0, original, 'abcd')).toBeUndefined();
	expect(host.firstChild).toBe(original);
	expect(original.data).toBe('abc');
});

it('never coalesces across an opaque intrinsic operation', () => {
	const host = document.createElement('p');
	const original = document.createTextNode('ab');
	host.append(original);
	const opaque = createCompiledIntrinsicReceipt('b', {}, []);
	expect(adoptCoalescedScalarTextRun(['a', opaque, 'b'], 0, original, 'a')).toBeUndefined();
	expect(host.childNodes).toHaveLength(1);
	expect(original.data).toBe('ab');
});
