import {
	currentEffectScope,
	registerEffectScopeCleanup
} from '@exactjs/reactive/framework/runtime';
import { createFrameworkFixtureComponentInstance } from './testing.js';
import { flushSync, watch } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import './runtime/lifecycle.js';
import './runtime/logging.js';
import { ErrorContext, createErrorContext, type Component, type ErrorReport } from './index.js';

describe('@exactjs/core lifecycle', () => {
	it('routes scheduled setup watcher failures through the component error context', () => {
		let instance!: Component<{ count: number; errors: ErrorReport[] }>;
		createFrameworkFixtureComponentInstance(function Worker(
			this: Component<{ count: number; errors: ErrorReport[] }>
		) {
			instance = this;
			this.state.count = 0;
			this.state.errors = [];
			this.setContext(ErrorContext, createErrorContext(this.state.errors));
			watch(() => {
				if (this.state.count === 1) throw new Error('watch failed');
			});
			return () => null;
		}, {});

		instance.state.count = 1;
		expect(() => flushSync()).not.toThrow();
		expect(instance.state.errors).toHaveLength(1);
		expect(instance.state.errors[0]).toMatchObject({ source: 'reactive', phase: 'watch' });
	});

	it('runs normal lifecycle cleanup when construction fails', () => {
		const unmountCleanup = vi.fn();

		expect(() =>
			createFrameworkFixtureComponentInstance(function Broken(this: Component<{}>) {
				this.onUnmount(unmountCleanup);
				throw new Error('construct failed');
			}, {})
		).toThrow('construct failed');

		expect(unmountCleanup).toHaveBeenCalledTimes(1);
	});

	it.each(['onMount', 'onActivate'] as const)(
		'owns watchers created synchronously by %s callbacks',
		(phase) => {
			const values: number[] = [];
			const instance = createFrameworkFixtureComponentInstance(function MountedWatcher(
				this: Component<{ count: number }>
			) {
				this.state.count = 0;
				this[phase](() => {
					watch(() => {
						values.push(this.state.count);
					});
				});
				return () => null;
			}, {});
			instance.markMounted();
			instance.state.count = 1;
			flushSync();
			expect(values).toEqual([0, 1]);
			instance.unmount();
			instance.state.count = 2;
			flushSync();
			expect(values).toEqual([0, 1]);
		}
	);

	it.each(['onMount', 'onActivate'] as const)(
		'stops %s dispatch when a handler unmounts the owner',
		(phase) => {
			const late = vi.fn();
			const instance = createFrameworkFixtureComponentInstance(function Disposing(
				this: Component<{}>
			) {
				this[phase](() => instance.unmount());
				this[phase](late);
				return () => null;
			}, {});
			instance.markMounted();
			expect(late).not.toHaveBeenCalled();
		}
	);

	it('replaces activation watchers across repeated park and restore cycles', () => {
		const values: number[] = [];
		const token = Symbol('activity');
		const instance = createFrameworkFixtureComponentInstance(function Activating(
			this: Component<{ count: number }>
		) {
			this.state.count = 0;
			this.onActivate(() => {
				watch(() => {
					values.push(this.state.count);
				});
			});
			return () => null;
		}, {});
		instance.markMounted();
		for (let count = 1; count <= 3; count++) {
			instance.setActivity(token, false);
			instance.state.count = count;
			flushSync();
			expect(values).toEqual(Array.from({ length: count }, (_, index) => index));
			instance.setActivity(token, true);
		}
		instance.state.count = 4;
		flushSync();
		expect(values).toEqual([0, 1, 2, 3, 4]);
		instance.unmount();
		instance.state.count = 5;
		flushSync();
		expect(values).toEqual([0, 1, 2, 3, 4]);
	});

	it('stops activation dispatch when a handler parks the owner', () => {
		const token = Symbol('activity');
		const late = vi.fn();
		const instance = createFrameworkFixtureComponentInstance(function Parking(this: Component<{}>) {
			this.onActivate(() => instance.setActivity(token, false));
			this.onActivate(late);
			return () => null;
		}, {});
		instance.markMounted();
		expect(late).not.toHaveBeenCalled();
		instance.unmount();
	});

	it('preserves a new activation started by the previous activation abort handler', () => {
		const token = Symbol('activity');
		const values: number[] = [];
		let activations = 0;
		const instance = createFrameworkFixtureComponentInstance(function Reactivating(
			this: Component<{ count: number }>
		) {
			this.state.count = 0;
			this.onActivate(({ signal }) => {
				if (++activations === 1)
					signal.addEventListener('abort', () => instance.setActivity(token, true), { once: true });
				watch(() => {
					values.push(this.state.count);
				});
			});
			return () => null;
		}, {});
		instance.markMounted();
		instance.setActivity(token, false);
		instance.state.count = 1;
		flushSync();
		expect(activations).toBe(2);
		expect(values).toEqual([0, 0, 1]);
		instance.unmount();
		instance.state.count = 2;
		flushSync();
		expect(values).toEqual([0, 0, 1]);
	});

	it('reports activation cleanup failures without skipping deactivation or final cleanup', () => {
		const errors: ErrorReport[] = [];
		const failure = new Error('activation cleanup failed');
		const deactivated = vi.fn();
		const unmounted = vi.fn();
		const instance = createFrameworkFixtureComponentInstance(function Cleanup(this: Component<{}>) {
			this.setContext(ErrorContext, createErrorContext(errors));
			this.onActivate(() => {
				registerEffectScopeCleanup(currentEffectScope()!, () => {
					throw failure;
				});
			});
			this.onDeactivate(deactivated);
			this.onUnmount(unmounted);
			return () => null;
		}, {});
		instance.markMounted();
		instance.setActivity(Symbol('activity'), false);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatchObject({ error: failure, source: 'lifecycle', phase: 'deactivate' });
		expect(deactivated).toHaveBeenCalledTimes(1);
		instance.unmount();
		expect(unmounted).toHaveBeenCalledTimes(1);
		expect(errors).toHaveLength(1);
	});

	it('shares stable methods and allocates lifecycle cancellation only when used', () => {
		const first = createFrameworkFixtureComponentInstance(function First() {
			return () => null;
		}, {});
		const second = createFrameworkFixtureComponentInstance(function Second() {
			return () => null;
		}, {});

		expect(first.onMount).toBe(second.onMount);
		expect(first.setContext).toBe(second.setContext);
		expect(first.log.info).toBe(second.log.info);
		first.markMounted();
		expect(first.mountController).toBeUndefined();
		expect(first.activationController).toBeUndefined();

		let mountSignal!: AbortSignal;
		let activationSignal!: AbortSignal;
		const observed = createFrameworkFixtureComponentInstance(function Observed(
			this: Component<{}>
		) {
			this.onMount(({ signal }) => (mountSignal = signal));
			this.onActivate(({ signal }) => (activationSignal = signal));
			return () => null;
		}, {});
		observed.markMounted();
		expect(mountSignal.aborted).toBe(false);
		expect(activationSignal.aborted).toBe(false);
		observed.unmount();
		expect(mountSignal.aborted).toBe(true);
		expect(activationSignal.aborted).toBe(true);
	});
});
import './runtime/contexts.js';
