import { describe, expect, it } from 'vitest';
import { computed, flushSync, reactive, watch } from '@exactjs/reactive';
import { isOpaqueOperation } from './opaque-operation.js';
import { createCompiledFragmentReceipt, readCompiledFragmentReceipt } from './fragment-receipt.js';
import {
	createCompiledKeyedChildReceipt,
	readCompiledKeyedChildReceipt
} from './keyed-child-receipt.js';
import { createCompiledTargetReceipt, readCompiledTargetReceipt } from './target-receipt.js';

describe('focused structural receipts', () => {
	it('keeps transparent and target ranges opaque outside their target reader', () => {
		const fragment = createCompiledFragmentReceipt({}, 'before', 'after');
		const target = createCompiledTargetReceipt({ className: 'surface' }, fragment);

		expect(isOpaqueOperation(fragment)).toBe(true);
		expect(isOpaqueOperation(target)).toBe(true);
		expect(Object.keys(fragment)).toEqual([]);
		expect(Object.keys(target)).toEqual([]);
		expect(readCompiledFragmentReceipt(fragment)?.children).toEqual(['before', 'after']);
		expect(readCompiledTargetReceipt(target)?.props).toEqual({ className: 'surface' });
	});

	it('joins keyed identity without exposing or mutating the nested operation', () => {
		const child = createCompiledFragmentReceipt({}, 'value');
		const keyed = createCompiledKeyedChildReceipt(child, 42);

		expect(isOpaqueOperation(keyed)).toBe(true);
		expect(readCompiledKeyedChildReceipt(keyed)).toEqual({ value: child, key: '42' });
		expect(readCompiledFragmentReceipt(child)?.key).toBeUndefined();
	});

	it('treats distinct opaque operations as identity changes despite their empty public shape', () => {
		const state = reactive({ label: 'before' });
		const operation = computed(() => createCompiledTargetReceipt({ label: state.label }));
		const labels: unknown[] = [];
		const stop = watch(() => labels.push(readCompiledTargetReceipt(operation.get())?.props.label));

		state.label = 'after';
		flushSync();
		stop();

		expect(labels).toEqual(['before', 'after']);
		expect(Object.keys(operation.get())).toEqual([]);
	});

	it('preserves opaque operation identity through reactive parent props', () => {
		const operation = createCompiledTargetReceipt({ label: 'child' });
		const props = reactive({ operation });

		expect(props.operation).toBe(operation);
		expect(readCompiledTargetReceipt(props.operation)?.props.label).toBe('child');
	});
});
