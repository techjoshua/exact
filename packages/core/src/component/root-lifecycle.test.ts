import { flushSync, watch } from '@exactjs/reactive';
import { describe, expect, it, onTestFinished } from 'vitest';
import { createFrameworkFixtureComponentInstance } from '../testing.js';
import {
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
		expect(Object.isFrozen(lifecycle)).toBe(true);
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
		expect(lifecycle.release).toBe(release);
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
});
