import { flushSync, watch } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import {
	ErrorContext,
	createErrorContext,
	createVNode,
	type Component,
	type ErrorReport
} from './index.js';
import { createComponentInstance, renderInstance } from './runtime/render.js';

describe('@exactjs/core lifecycle', () => {
	it('constructs once and renders repeatedly from tracked state', () => {
		const constructed = vi.fn();
		const rendered = vi.fn();

		function Counter(this: Component<{ count: number }>) {
			constructed();
			this.state.count = 0;
			return () => {
				rendered();
				return Number(this.state.count) > 0
					? createVNode('span', null, 'positive')
					: createVNode('span', null, 'zero');
			};
		}

		const instance = createComponentInstance(Counter, {});
		renderInstance(instance, () => renderInstance(instance, () => undefined));
		instance.state.count = 1;
		flushSync();

		expect(constructed).toHaveBeenCalledTimes(1);
		expect(rendered).toHaveBeenCalledTimes(2);
	});

	it('routes scheduled setup watcher failures through the component error context', () => {
		let instance!: Component<{ count: number; errors: ErrorReport[] }>;
		createComponentInstance(function Worker(
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
			createComponentInstance(function Broken(this: Component<{}>) {
				this.onUnmount(unmountCleanup);
				throw new Error('construct failed');
			}, {})
		).toThrow('construct failed');

		expect(unmountCleanup).toHaveBeenCalledTimes(1);
	});

	it('shares stable methods and allocates lifecycle cancellation only when used', () => {
		const first = createComponentInstance(function First() {
			return () => null;
		}, {});
		const second = createComponentInstance(function Second() {
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
		const observed = createComponentInstance(function Observed(this: Component<{}>) {
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
