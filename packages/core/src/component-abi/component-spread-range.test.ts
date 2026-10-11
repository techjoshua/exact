import { unwrap, reactive } from '@exactjs/reactive';
import { expect, it } from 'vitest';
import { createCompiledComponentSpreadRange } from './component-spread-range.js';
import { createCompiledComponentSpreadRange as serverRange } from './server-component-spread-range.js';
import { readChildRangeReceipt } from './child-range-receipt.js';
import { readPreparedServerChildRange } from './server-child-range.js';
import { createOpaqueOperation, opaqueOperationKey } from './opaque-operation.js';

it('defers one cached prop copy until key resolution and follows replacement keys', () => {
	const source = reactive({ key: 'a' });
	let prepared = false;
	let copies = 0;
	const range = createCompiledComponentSpreadRange(() => {
		expect(prepared).toBe(true);
		copies++;
		return createOpaqueOperation(undefined, { key: source.key });
	});
	expect(copies).toBe(0);
	prepared = true;
	expect(opaqueOperationKey(range)).toBe('a');
	expect(opaqueOperationKey(range)).toBe('a');
	const value = readChildRangeReceipt(range)!.value;
	expect(opaqueOperationKey(unwrap(value))).toBe('a');
	expect(copies).toBe(1);
	source.key = 'b';
	expect(opaqueOperationKey(range)).toBe('b');
	expect(copies).toBe(2);
});

it('defers and caches the matching server range without allocating a reactive computation', () => {
	let copies = 0;
	const range = serverRange(() => {
		copies++;
		return 'prepared';
	});
	expect(copies).toBe(0);
	expect(readPreparedServerChildRange(range)!.value).toBe('prepared');
	expect(readPreparedServerChildRange(range)!.value).toBe('prepared');
	expect(copies).toBe(1);
});
