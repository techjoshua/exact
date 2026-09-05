/* eslint-disable @typescript-eslint/no-explicit-any -- This test intentionally models external, private, or invalid values that production contracts reject. */
import { createFrameworkFixtureComponentInstance } from './testing.js';
import { flushSync, watch } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import './runtime/lifecycle.js';
import {
	ErrorContext,
	createErrorContext,
	taskAwait,
	type Component,
	type ErrorReport
} from './index.js';
import { executeCompiledComponentOutput } from './component/compiled-output.js';
import {
	createCompiledIntrinsicReceipt,
	readCompiledIntrinsicReceipt
} from './component-abi/intrinsic-receipt.js';
import { defaultErrorContext } from './component/errors.js';

describe('@exactjs/core errors', () => {
	it('bounds only the process-global fallback context to the newest one hundred reports', () => {
		defaultErrorContext.clearAll();
		try {
			for (let index = 0; index < 105; index++)
				defaultErrorContext.report(new Error(`failure-${index}`));
			expect(defaultErrorContext.errors).toHaveLength(100);
			expect(String(defaultErrorContext.errors[0]?.error)).toContain('failure-5');
			expect(String(defaultErrorContext.errors.at(-1)?.error)).toContain('failure-104');

			const application = createErrorContext();
			for (let index = 0; index < 105; index++) application.report(new Error(String(index)));
			expect(application.errors).toHaveLength(105);
		} finally {
			defaultErrorContext.clearAll();
		}
	});
	it('routes render failures to the nearest error context', () => {
		let instance!: Component<{ errors: ErrorReport[] }>;

		const component = createFrameworkFixtureComponentInstance(function Broken(
			this: Component<{ errors: ErrorReport[] }>
		) {
			instance = this;
			this.state.errors = [];
			this.setContext(ErrorContext, createErrorContext(this.state.errors));

			return () => {
				if (this.state.errors.length)
					return createCompiledIntrinsicReceipt('span', null, 'fallback');
				throw new Error('render failed');
			};
		}, {});

		executeCompiledComponentOutput(component);
		flushSync();
		const nodes = executeCompiledComponentOutput(component);

		expect(instance.state.errors).toHaveLength(1);
		expect(instance.state.errors[0]!.source).toBe('render');
		expect(readCompiledIntrinsicReceipt(nodes[0])?.children[0]).toBe('fallback');
	});

	it('lets components report and clear errors through error context', () => {
		let instance!: Component<{ errors: ErrorReport[] }>;
		let report!: ErrorReport;

		const parent = createFrameworkFixtureComponentInstance(function Boundary(
			this: Component<{ errors: ErrorReport[] }>
		) {
			instance = this;
			this.state.errors = [];
			this.setContext(ErrorContext, createErrorContext(this.state.errors));
			return () => null;
		}, {});

		createFrameworkFixtureComponentInstance(
			function Reporter(this: Component<{}>) {
				const errors = this.getContext(ErrorContext);
				report = errors.report(new Error('manual failure'), {
					source: 'component',
					phase: 'validate'
				});
				errors.clear(report.id);
				errors.report('second failure');
				errors.clearAll();
				return () => null;
			},
			{},
			parent
		);

		expect(report.source).toBe('component');
		expect(report.phase).toBe('validate');
		expect(instance.state.errors).toHaveLength(0);
	});

	it('makes plain error context arrays reactive', () => {
		const errors = createErrorContext([]);
		let count = 0;

		const stop = watch(() => {
			void errors.errors.length;
			count++;
		});

		errors.report('first');
		flushSync();
		errors.clearAll();
		flushSync();
		stop();

		expect(count).toBe(3);
	});

	it('continues unmount cleanup after lifecycle failures', () => {
		let instance!: Component<{ errors: ErrorReport[] }>;
		const cleanup = vi.fn();

		const component = createFrameworkFixtureComponentInstance(function Worker(
			this: Component<{ errors: ErrorReport[] }>
		) {
			instance = this;
			this.state.errors = [];
			this.setContext(ErrorContext, createErrorContext(this.state.errors));
			this.onUnmount(() => {
				throw new Error('unmount failed');
			});
			this.onUnmount(cleanup);
			return () => null;
		}, {});

		component.markMounted();
		component.unmount();

		expect(instance.state.errors).toHaveLength(1);
		expect(instance.state.errors[0]!.source).toBe('lifecycle');
		expect(instance.state.errors[0]!.phase).toBe('unmount');
		expect(cleanup).toHaveBeenCalledTimes(1);
	});

	it('finishes component teardown before rethrowing a synchronous ownership failure', () => {
		const cleanup = vi.fn();
		const component = createFrameworkFixtureComponentInstance(function Worker(this: Component<{}>) {
			this.onUnmount(cleanup);
			return () => null;
		}, {}) as any;
		component.scope.reactions.add({
			stop() {
				throw new Error('reaction stop failed');
			}
		});

		expect(() => component.unmount()).toThrow('reaction stop failed');
		expect(cleanup).toHaveBeenCalledTimes(1);
		expect(component.mounted).toBe(false);
		expect(() => component.unmount()).not.toThrow();
	});

	it('actively aborts taskAwait even when its input never settles', async () => {
		const controller = new AbortController();
		const awaited = taskAwait(controller.signal, new Promise<string>(() => undefined));
		controller.abort('rerun');
		await expect(awaited).rejects.toMatchObject({ name: 'AbortError', message: 'rerun' });
	});

	it('isolates the framework error context between application roots', () => {
		const failing = () =>
			createFrameworkFixtureComponentInstance(function Root(this: Component<{}>) {
				return () => {
					throw new Error('root failure');
				};
			}, {});
		const first = failing();
		const second = createFrameworkFixtureComponentInstance(function Root(this: Component<{}>) {
			return () => null;
		}, {});
		const firstChild = createFrameworkFixtureComponentInstance(
			function Child(this: Component<{}>) {
				return () => null;
			},
			{},
			first
		);
		const secondChild = createFrameworkFixtureComponentInstance(
			function Child(this: Component<{}>) {
				return () => null;
			},
			{},
			second
		);
		executeCompiledComponentOutput(first);
		expect(firstChild.getContext(ErrorContext).errors).toHaveLength(1);
		expect(secondChild.getContext(ErrorContext).errors).toHaveLength(0);
	});
});
import './runtime/contexts.js';
