import { expect, it } from 'vitest';
import { reactive, watch, flushSync } from '../index.js';
import {
	getDep,
	reactiveDependencyKeys,
	registerDependencyObservationHooks
} from './dependency-graph.js';

it('retains dependency identity across promotion and observer cleanup', () => {
	const target = { a: 1, b: 2 };
	const state = reactive(target);
	const stopA = watch(() => state.a);
	const depA = getDep(target, 'a');
	const stopB = watch(() => state.b);
	const depB = getDep(target, 'b');
	expect(getDep(target, 'a')).toBe(depA);
	stopA();
	expect([...reactiveDependencyKeys(target)]).toEqual(['b']);
	expect(getDep(target, 'b')).toBe(depB);
	stopB();
	expect([...reactiveDependencyKeys(target)]).toEqual([]);
});

it.each([false, true])(
	'keeps a synchronously replaced last observer subscribed (multi-key: %s)',
	(multiple) => {
		const target = { value: 1, other: 0 };
		const state = reactive(target);
		const values: number[] = [];
		let replacement: (() => void) | undefined;
		const unregister = registerDependencyObservationHooks(target, 'value', {
			onObserved() {},
			onUnobserved() {
				replacement ??= watch(() => {
					values.push(state.value);
				});
			}
		});
		const stopOther = multiple ? watch(() => state.other) : undefined;
		const stop = watch(() => state.value);
		try {
			stop();
			state.value = 2;
			flushSync();
			expect(values).toEqual([1, 2]);
		} finally {
			unregister();
			replacement?.();
			stopOther?.();
			stop();
		}
	}
);
