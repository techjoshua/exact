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
			let instance: ReturnType<typeof createFrameworkFixtureComponentInstance>;
			instance = createFrameworkFixtureComponentInstance(function Disposing(this: Component<{}>) {
				this[phase](() => instance.unmount());
				this[phase](late);
				return () => null;
			}, {});
			instance.markMounted();
			expect(late).not.toHaveBeenCalled();
		}
	);

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
