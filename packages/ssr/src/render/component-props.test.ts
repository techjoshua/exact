import { createPreparedServerComponentInputReference } from '@exactjs/core/framework/server-render-structure';
import {
	readServerComponentReference,
	prepareServerComponentInputs,
	deriveResumptionComponentInputs
} from './server-component-reference.js';
import { ScalarProp } from './component-prop-values.fixtures.test.js';
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

it('keeps captured children separate from authored accessor receivers and exact callable values', () => {
	const events: string[] = [],
		failure = new Error('accessor failure'),
		callback = () => 'uninvoked';
	let childrenReads = 0;
	class Inputs {
		#label = 'before';
		get children() {
			events.push('children');
			childrenReads++;
			return undefined;
		}
		get inherited() {
			events.push('inherited');
			return this.#label;
		}
		set inherited(value: string) {
			events.push('set');
			this.#label = value;
		}
	}
	const props = new Inputs();
	Object.defineProperties(props, {
		own: {
			get() {
				events.push('own');
				return this.inherited;
			},
			enumerable: false,
			configurable: false
		},
		failure: {
			get() {
				throw failure;
			},
			enumerable: true
		},
		callback: { value: callback, enumerable: true, writable: false }
	});
	const reference = readServerComponentReference(
		createPreparedServerComponentInputReference(
			ScalarProp,
			props as unknown as Record<string, unknown>
		)
	)!;
	const record = prepareServerComponentInputs(reference.admitted, {}, {});
	const view = record.constructionProps;
	expect(events).toEqual(['children']);
	expect(view.children).toBeUndefined();
	expect(view.own).toBe('before');
	expect(Reflect.set(view, 'inherited', 'after')).toBe(true);
	expect(view.inherited).toBe('after');
	expect(() => view.failure).toThrow(failure);
	expect(view.callback).toBe(callback);
	expect(Object.getOwnPropertyDescriptor(view, 'own')).toMatchObject({
		enumerable: false,
		configurable: false
	});
	const derived = deriveResumptionComponentInputs(record, 'substitution', undefined);
	expect(derived.constructionProps.own).toBe('after');
	expect(derived.constructionProps.children).toBe('substitution');
	expect(derived.publicationProps.children).toBeUndefined();
	expect(childrenReads).toBe(1);
});
