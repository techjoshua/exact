import { createRef } from '../keys.js';
import { verifyRefRootValues } from '../../../component-composition-corpus/test-support/ref-root-value-journey.mjs';
import {
	directSsrRef,
	directSsrRefs,
	directSsrRoot
} from '../../../ssr/src/runtime/direct-refs.js';
import '../runtime/refs.js';
import { batch, flushSync, watch } from '@exactjs/reactive';
import { describe, expect, it, onTestFinished } from 'vitest';
import { createFrameworkFixtureComponentInstance } from '../testing.js';
import {
	bindComponentRoot,
	componentRootLifecycle,
	componentRootReleaseObserved,
	disposeComponentRoot,
	publishComponentRoot,
	publishComponentRootPresentation,
	publishComponentRootRelease,
	reverseComponentRootRelease,
	settleComponentRootRelease
} from './root-lifecycle.js';

/** Owns a real component whose root publication is driven explicitly by each contract test. */
function owner() {
	const instance = createFrameworkFixtureComponentInstance(() => () => null, {});
	onTestFinished(() => instance.unmount());
	return instance;
}

describe('component root observation', () => {
	it('preserves published generations and presentation when observation starts late', () => {
		const instance = owner();
		const first = {};
		const second = {};
		publishComponentRoot(instance, first, true, 'hydration');
		publishComponentRoot(instance, second, true, 'update');
		publishComponentRootPresentation(instance, false);
		expect(componentRootReleaseObserved(instance)).toBe(false);
		expect(publishComponentRootRelease(instance, 'reconcile-removed')).toBeUndefined();

		const lifecycle = componentRootLifecycle(instance);
		expect(componentRootLifecycle(instance)).toBe(lifecycle);
		expect(lifecycle.current).toBe(second);
		expect(lifecycle.generation).toBe(2);
		expect(lifecycle.introduction).toBe('update');
		expect(lifecycle.presented).toBe(false);
		expect(componentRootReleaseObserved(instance)).toBe(true);

		const presentations: boolean[] = [];
		onTestFinished(
			watch(() => {
				presentations.push(lifecycle.presented);
			})
		);
		publishComponentRootPresentation(instance, true);
		flushSync();
		expect(presentations).toEqual([false, true]);
	});

	it('reactively publishes, reverses, and settles the retained generation after late observation', () => {
		const instance = owner();
		const target = {};
		publishComponentRoot(instance, target, true, 'hydration');
		const lifecycle = componentRootLifecycle(instance);
		const currents: Array<object | undefined> = [];
		onTestFinished(
			watch(() => {
				currents.push(lifecycle.current);
			})
		);
		const release = publishComponentRootRelease(instance, 'reconcile-replaced');
		flushSync();
		expect(release).toEqual({
			target,
			generation: 1,
			reason: 'reconcile-replaced',
			presented: true
		});
		expect(lifecycle.release).toEqual(release);
		expect(reverseComponentRootRelease(instance, 2)).toBe(false);
		expect(reverseComponentRootRelease(instance, 1)).toBe(true);
		flushSync();
		expect(currents).toEqual([target, undefined, target]);
		expect(lifecycle.introduction).toBe('hydration');
		expect(lifecycle.release).toBeUndefined();
		publishComponentRootRelease(instance, 'reconcile-removed');
		settleComponentRootRelease(instance, 2);
		expect(lifecycle.release).toBeDefined();
		settleComponentRootRelease(instance, 1);
		expect(lifecycle.release).toBeUndefined();
	});

	it('supports observation before publication and clears the held facade on disposal', () => {
		const instance = owner();
		const lifecycle = componentRootLifecycle(instance);
		const target = {};
		const currents: Array<object | undefined> = [];
		onTestFinished(
			watch(() => {
				currents.push(lifecycle.current);
			})
		);
		publishComponentRoot(instance, target, true, 'initial');
		flushSync();
		disposeComponentRoot(instance);
		flushSync();
		expect(currents).toEqual([undefined, target, undefined]);
		expect(lifecycle.introduction).toBeUndefined();
		expect(lifecycle.presented).toBe(false);
		expect(lifecycle.release).toBeUndefined();
		expect(componentRootReleaseObserved(instance)).toBe(false);
	});
	it('keeps public release observations writable without changing private generation authority', () => {
		const instance = owner();
		const target = {};
		publishComponentRoot(instance, target, true, 'initial');
		const lifecycle = componentRootLifecycle(instance);
		publishComponentRootRelease(instance, 'reconcile-removed');
		const view = lifecycle.release!;
		const alias: { generation: number; target: object; presented: boolean } = view;
		alias.generation = 999;
		alias.target = {};
		alias.presented = false;
		expect(reverseComponentRootRelease(instance, 999)).toBe(false);
		expect(reverseComponentRootRelease(instance, 1)).toBe(true);
		expect(lifecycle.current).toBe(target);
		expect(lifecycle.presented).toBe(true);
		expect(lifecycle.release).toBeUndefined();
	});
	it('rolls public observations and private release authority back together', () => {
		const instance = owner();
		const target = {};
		publishComponentRoot(instance, target, true, 'initial');
		const lifecycle = componentRootLifecycle(instance);
		publishComponentRootRelease(instance, 'reconcile-removed');
		expect(() =>
			batch(() => {
				expect(reverseComponentRootRelease(instance, 1)).toBe(true);
				throw new Error('abort');
			})
		).toThrow('abort');
		expect(lifecycle.current).toBeUndefined();
		expect(lifecycle.release).toBeDefined();
		expect(reverseComponentRootRelease(instance, 1)).toBe(true);
		expect(lifecycle.current).toBe(target);
	});
	it('shares source and built-package ref/root value controls', () => {
		expect(
			verifyRefRootValues({
				directSsrRef,
				directSsrRefs,
				directSsrRoot,
				createFrameworkFixtureComponentInstance,
				publishComponentRoot,
				publishComponentRootRelease,
				reverseComponentRootRelease,
				disposeComponentRoot,
				batch
			})
		).toBe(true);
	});
	it('keeps framework ref origin while preserving composed ref contracts', () => {
		const original = owner();
		const foreign = owner();
		const key = createRef<object>('root');
		const binding = original.ref(key);
		const alias: { owner: object } = binding;
		alias.owner = foreign;
		expect(() => bindComponentRoot(foreign, binding)).toThrow(/owned/);
		expect(bindComponentRoot(original, binding)).toBe(binding);
		const composedOwner = owner();
		const inner = composedOwner.ref(key);
		const composed = {
			key: inner.key,
			owner: inner.owner,
			get current() {
				return inner.current;
			},
			fulfill(value: object | undefined) {
				inner.fulfill(value);
			}
		};
		expect(bindComponentRoot(composedOwner, composed)).toBe(composed);
		composed.owner = foreign;
		expect(() => bindComponentRoot(foreign, composed)).toThrow(/owned/);
	});
});
