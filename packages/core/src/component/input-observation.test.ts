import {
	createEffectScope,
	createIndexedReactiveValue,
	flushSync
} from '@exactjs/reactive/framework/runtime';
import { indexedReactiveObjects } from '@exactjs/reactive/framework/indexed-objects';
import { expect, it } from 'vitest';
import { observeRetainedComponentInput } from './input-observation.js';

it('arms compact input observations after restoration and releases them with the component', () => {
	const scope = createEffectScope();
	const parent = indexedReactiveObjects(['first', 'second'], {}, { first: 2, second: 10 });
	const props = indexedReactiveObjects(
		['value'],
		{},
		{ value: createIndexedReactiveValue<number>(parent, 0) },
		true
	);
	const state = { result: 42 };
	const plan = {
		bindings: [[0, 1, 0]] as const,
		apply() {
			state.result = Number(props.value);
		}
	};
	expect(observeRetainedComponentInput({ state, props }, plan, plan.bindings[0], scope)).toBe(true);
	flushSync();
	expect(state.result).toBe(42);
	parent.first = 3;
	flushSync();
	expect(state.result).toBe(3);
	props.value = createIndexedReactiveValue<number>(parent, 1);
	flushSync();
	expect(state.result).toBe(10);
	parent.first = 4;
	flushSync();
	expect(state.result).toBe(10);
	scope.stop();
	parent.second = 11;
	flushSync();
	expect(state.result).toBe(10);
});

it('keeps finalized primitive inputs on the direct receive path', () => {
	const scope = createEffectScope();
	const props = indexedReactiveObjects(['value'], {}, { value: 2 });
	const plan = {
		bindings: [[0, 1, 0]] as const,
		apply() {
			throw new Error('unexpected observation');
		}
	};
	expect(observeRetainedComponentInput({ state: {}, props }, plan, plan.bindings[0], scope)).toBe(
		false
	);
	props.value = 3;
	expect(() => flushSync()).not.toThrow();
	scope.stop();
});
