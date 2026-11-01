import { writeFileSync } from 'node:fs';
import { reactive } from '@exactjs/reactive';
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

// Compiler allocation is a one-layer boundary. Authored reactive payloads must remain unread.
import { computed, withEffectScope } from '@exactjs/reactive/framework/runtime';
import {
	createComponentPropExpression,
	createForwardedComponentPropExpression
} from './reactive-expressions.js';
import { acquireComponentPropInputs } from '../component-abi/component-props.js';
import {
	readCompiledPropOperand,
	isCompiledPropOperand
} from '@exactjs/reactive/framework/runtime';
import { createComponentProps } from './state.js';
it('retains authored reactive identity across compiler prop acquisition and replacement', () => {
	let reads = 0;
	const first = computed(() => {
		reads++;
		return 7;
	});
	const second = computed(() => {
		reads++;
		return 7;
	});
	const state = reactive({ next: false });
	const operand = createComponentPropExpression(() => (state.next ? second : first));
	const props = createComponentProps({ value: operand }, ['value'], false, ['value']);
	expect(props.value).toBe(first);
	expect(acquireComponentPropInputs({ value: operand }, true).value).toBe(first);
	expect(createForwardedComponentPropExpression(() => props.value)).toBe(first);
	expect(reads).toBe(0);
	state.next = true;
	flushSync();
	expect(props.value).toBe(second);
	expect(reads).toBe(0);
});
it('does not read a returned reactive value after scope retirement or invoke a returned callable', () => {
	let reads = 0,
		calls = 0;
	const authored = computed(() => {
		reads++;
		return 3;
	});
	const scope = createEffectScope();
	const operand = withEffectScope(scope, () => createComponentPropExpression(() => authored));
	scope.stop();
	expect(readCompiledPropOperand(operand)).toBe(authored);
	expect(reads).toBe(0);
	const fn = () => {
		calls++;
	};
	expect(readCompiledPropOperand(createComponentPropExpression(() => fn))).toBe(fn);
	expect(calls).toBe(0);
});
it('preserves accessors and exact thrown values without probing authored marker getters', () => {
	let reads = 0;
	const fake: unknown[] = [];
	Object.defineProperty(fake, '0', {
		get() {
			reads++;
			return null;
		}
	});
	expect(isCompiledPropOperand(fake)).toBe(false);
	expect(reads).toBe(0);
	const props = {
		get value() {
			reads++;
			return 1;
		}
	};
	expect(acquireComponentPropInputs(props, true)).toBe(props);
	expect(reads).toBe(0);
	let caught = false;
	try {
		readCompiledPropOperand(
			createComponentPropExpression(() => {
				throw 0;
			})
		);
	} catch (error) {
		caught = true;
		expect(error).toBe(0);
	}
	expect(caught).toBe(true);
});

// Configurable keys may disappear between ownKeys and descriptor acquisition, including in a Proxy.
it('ignores a missing configurable prop descriptor without reading authored values', () => {
	const target: Record<string, unknown> = {};
	Object.defineProperty(target, 'gone', { value: 1, configurable: true, enumerable: true });
	let reads = 0,
		descriptorReads = 0;
	const props = new Proxy(target, {
		ownKeys: () => ['gone'],
		getOwnPropertyDescriptor() {
			descriptorReads++;
			return undefined;
		},
		get(object, key, receiver) {
			reads++;
			return Reflect.get(object, key, receiver);
		}
	});
	let result: Readonly<Record<string, unknown>> | undefined;
	let failure: unknown;
	try {
		result = acquireComponentPropInputs(props, true);
	} catch (error) {
		failure = error;
	}
	if (process.env.EXACT_PROP_DESCRIPTOR_OBSERVATION)
		writeFileSync(
			process.env.EXACT_PROP_DESCRIPTOR_OBSERVATION,
			JSON.stringify(
				{
					sameProps: result === props,
					reads,
					descriptorReads,
					failure:
						failure instanceof Error
							? { name: failure.name, message: failure.message, stack: failure.stack }
							: failure === undefined
								? null
								: String(failure)
				},
				null,
				2
			),
			{ flag: 'wx' }
		);
	expect(failure).toBeUndefined();
	expect(result).toBe(props);
	expect(reads).toBe(0);
});

import { ChildInputLeaf } from '../../../component-composition-corpus/test-support/component-child-input.fixtures.js';
import {
	createCompiledComponentInputReceipt,
	componentInputRecipe,
	redeemComponentInput
} from '../component-abi/receipt.js';
import { componentContractVersion } from './contract-versions.js';
import { compiledReactivePropertyOperand } from '@exactjs/reactive/framework/runtime';

it('keeps marked child operands atomic until receiving acquisition without reading authored values', () => {
	let expressionReads = 0,
		propertyReads = 0,
		authoredReads = 0,
		calls = 0;
	const authored = computed(() => ++authoredReads);
	const callable = () => ++calls;
	const expression = createComponentPropExpression(() => {
		expressionReads++;
		return authored;
	});
	const source = {
		get child() {
			propertyReads++;
			return callable;
		}
	};
	const property = [compiledReactivePropertyOperand, source, 'child'] as const;
	const ordinarySymbol = Symbol('ordinary');
	const operation = createCompiledComponentInputReceipt(ChildInputLeaf, null, {
		kind: 'eager',
		values: [['first', [expression]], [[property]], [ordinarySymbol, authored], callable, []]
	});
	const provider = { version: componentContractVersion, target: 'client' } as const;
	const children = componentInputRecipe(
		redeemComponentInput(operation, provider),
		provider
	).children;
	if (children.kind !== 'eager') throw new Error('Expected eager inputs');
	expect(children.values).toEqual([
		'first',
		expression,
		property,
		ordinarySymbol,
		authored,
		callable
	]);
	expect(children.values[1]).toBe(expression);
	expect(children.values[2]).toBe(property);
	expect(children.values[4]).toBe(authored);
	expect(children.values[5]).toBe(callable);
	expect([expressionReads, propertyReads, authoredReads, calls]).toEqual([0, 0, 0, 0]);
});

it('preserves eager ordinary array order and explicit emptiness without shape-based operand branding', () => {
	const provider = { version: componentContractVersion, target: 'client' } as const;
	for (const [values, expected] of [
		[
			[['a', [1, false]], null, undefined],
			['a', 1, false, null, undefined]
		],
		[[[], [[]]], [undefined]],
		[[], []]
	] as const) {
		const operation = createCompiledComponentInputReceipt(ChildInputLeaf, null, {
			kind: 'eager',
			values
		});
		const children = componentInputRecipe(
			redeemComponentInput(operation, provider),
			provider
		).children;
		if (children.kind !== 'eager') throw new Error('Expected eager inputs');
		expect(children.values).toEqual(expected);
	}
});
