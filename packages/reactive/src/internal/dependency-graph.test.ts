import { expect, it } from 'vitest';
import { reactive, watch, flushSync } from '../index.js';
import {
	getDep,
	reactiveDependencyKeys,
	registerDependencyObservationHooks,
	releaseDependencyObservationHooks
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
		const hooks = {
			onObserved() {},
			onUnobserved() {
				replacement ??= watch(() => {
					values.push(state.value);
				});
			}
		};
		registerDependencyObservationHooks(target, 'value', hooks);
		const stopOther = multiple ? watch(() => state.other) : undefined;
		const stop = watch(() => state.value);
		try {
			stop();
			state.value = 2;
			flushSync();
			expect(values).toEqual([1, 2]);
		} finally {
			releaseDependencyObservationHooks(target, 'value', hooks);
			replacement?.();
			stopOther?.();
			stop();
		}
	}
);

it('invokes shared observer methods on their owner and preserves replacement hooks', () => {
	const target = { value: 1 };
	const state = reactive(target);
	class Owner {
		observed = 0;
		unobserved = 0;
		onObserved() {
			this.observed++;
		}
		onUnobserved() {
			this.unobserved++;
		}
	}
	const original = new Owner();
	const replacement = new Owner();
	registerDependencyObservationHooks(target, 'value', original);
	const stop = watch(() => state.value);
	try {
		expect(original.observed).toBe(1);
		registerDependencyObservationHooks(target, 'value', replacement);
		releaseDependencyObservationHooks(target, 'value', original);
		stop();
		expect(replacement.unobserved).toBe(1);
		const next = watch(() => state.value);
		try {
			expect(replacement.observed).toBe(1);
			releaseDependencyObservationHooks(target, 'value', replacement);
		} finally {
			next();
		}
		expect(replacement.unobserved).toBe(1);
	} finally {
		releaseDependencyObservationHooks(target, 'value', replacement);
		stop();
	}
});
