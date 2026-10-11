import { expect, it, vi } from 'vitest';
import { flushSync } from '@exactjs/reactive';
import { indexedReactiveObjects } from '@exactjs/reactive/framework/indexed-objects';
import { createTaskArgumentDependencies } from './argument-dependencies.js';

it('evaluates the argument vector once and shares one reactive subscription across positions', () => {
	const state = indexedReactiveObjects(['value'], {}, { value: 1 });
	const compute = vi.fn(() => [state.value, state.value + 1] as const);
	const inputs = createTaskArgumentDependencies(compute, 2);
	const notify = vi.fn();
	const first = inputs[0].subscribe(notify);
	const second = inputs[1].subscribe(notify);
	try {
		expect(inputs[0].read()).toMatchObject({ value: 1 });
		expect(inputs[1].read()).toMatchObject({ value: 2 });
		expect(compute).toHaveBeenCalledTimes(1);
		first[Symbol.dispose]();
		state.value = 2;
		flushSync();
		expect(inputs[1].read()).toMatchObject({ value: 3 });
		expect(compute).toHaveBeenCalledTimes(2);
		expect(notify).toHaveBeenCalledTimes(1);
		second[Symbol.dispose]();
		state.value = 3;
		flushSync();
		expect(compute).toHaveBeenCalledTimes(2);
	} finally {
		first[Symbol.dispose]();
		second[Symbol.dispose]();
	}
});

it('retains missing default inputs while evaluating an empty spread once', () => {
	const compute = vi.fn(() => [] as const);
	expect(createTaskArgumentDependencies(compute, 0)).toEqual([]);
	expect(compute).toHaveBeenCalledTimes(1);
	const inputs = createTaskArgumentDependencies(() => [1] as const, 2);
	expect(inputs[0].read()).toMatchObject({ value: 1 });
	expect((inputs as readonly { read(): unknown }[])[1]!.read()).toMatchObject({ value: undefined });
});
