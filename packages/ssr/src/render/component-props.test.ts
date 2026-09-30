import { expect, it } from 'vitest';
import { reactive } from '@exactjs/reactive';
import { createExpression } from '@exactjs/core/runtime/render-operations';
import { prepareComponentProps, prepareDirectComponentProps } from './component-props.js';

it('retains a plain props bag and callable values without invoking them', () => {
	const callback = () => {
		throw new Error('not an expression');
	};
	const props = { value: false, callback, nested: { value: 0 } };
	expect(prepareDirectComponentProps(props, undefined, {})).toBe(props);
});

it('snapshots direct expressions without mutating their source or flattening ordinary instance inputs', () => {
	const state = reactive({ value: false });
	const expression = createExpression(() => state.value);
	const props = { value: expression };
	expect(prepareComponentProps(props, undefined, {})).toBe(props);
	expect(prepareDirectComponentProps(props, ['value'], {})).toEqual({ value: false });
	expect(props.value).toBe(expression);
	state.value = true;
	expect(prepareDirectComponentProps(props, undefined, {})).toEqual({ value: true });
});

it('propagates expression evaluation failures', () => {
	const props = {
		value: createExpression(() => {
			throw new Error('failed input');
		})
	};
	expect(() => prepareDirectComponentProps(props, undefined, {})).toThrow('failed input');
});
