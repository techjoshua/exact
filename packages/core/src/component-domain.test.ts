import { createFrameworkFixtureComponentInstance } from './testing.js';
import { createEffectScope, reactive, watch } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import type { Component } from './index.js';
import { createComponentDomain, pageComponentDomain, withComponentDomain } from './index.js';
import { executeCompiledComponentOutput } from './component/compiled-output.js';
import {
	createCompiledIntrinsicReceipt,
	readCompiledIntrinsicReceipt
} from './component-abi/intrinsic-receipt.js';
import {
	callWithComponentDomain,
	callWithComponentDomainInEffectScope,
	componentDomainInspection,
	createFrameworkComponentDomain,
	currentComponentDomain
} from './component/domain.js';

describe('component domains', () => {
	it('captures the active immutable domain on compiler-issued operations', () => {
		const remote = createComponentDomain({ executionRoot: '@company/billing#./Area' });
		const operation = withComponentDomain(remote, () =>
			createCompiledIntrinsicReceipt('section', null)
		);
		const data = readCompiledIntrinsicReceipt(operation)!;
		expect(data.domain).toBe(remote);
		expect(() => {
			(data.domain as { executionRoot: string }).executionRoot = 'other';
		}).toThrow();
	});

	it('calls under one domain and reactive scope and restores both after failure', () => {
		const domain = createComponentDomain({ executionRoot: 'scoped' });
		const scope = createEffectScope();
		const state = reactive({ value: 0 });
		let observed = -1;
		callWithComponentDomainInEffectScope(domain, scope, () => {
			expect(currentComponentDomain()).toBe(domain);
			watch(() => {
				observed = state.value;
			});
		});
		expect(currentComponentDomain()).toBeUndefined();
		expect(observed).toBe(0);
		scope.stop();
		state.value = 1;
		expect(observed).toBe(0);

		expect(() =>
			callWithComponentDomainInEffectScope(domain, createEffectScope(), () => {
				throw new Error('scoped failure');
			})
		).toThrow('scoped failure');
		expect(currentComponentDomain()).toBeUndefined();
	});

	it('calls a receiver with an active domain and restores the previous domain after failure', () => {
		const outer = createComponentDomain({ executionRoot: 'outer' });
		const inner = createComponentDomain({ executionRoot: 'inner' });
		const receiver = { value: 2 };
		expect(
			withComponentDomain(outer, () =>
				callWithComponentDomain(
					inner,
					function (this: typeof receiver, increment: number) {
						expect(currentComponentDomain()).toBe(inner);
						return this.value + increment;
					},
					receiver,
					3
				)
			)
		).toBe(5);
		expect(currentComponentDomain()).toBeUndefined();

		expect(() =>
			withComponentDomain(outer, () =>
				callWithComponentDomain(
					inner,
					() => {
						throw new Error('failed');
					},
					undefined,
					undefined
				)
			)
		).toThrow('failed');
		expect(currentComponentDomain()).toBeUndefined();
	});

	it('uses the instance domain during setup and every render', () => {
		const remote = createComponentDomain({ executionRoot: '@company/billing#./Area' });
		function Area(this: Component<{ count: number }>) {
			this.state.count = 1;
			const setup = createCompiledIntrinsicReceipt('span', { phase: 'setup' });
			return () => [setup, createCompiledIntrinsicReceipt('span', { count: this.state.count })];
		}
		const instance = createFrameworkFixtureComponentInstance(
			Area,
			{},
			undefined,
			undefined,
			remote
		);
		const output = executeCompiledComponentOutput(instance);
		expect(instance.domain).toBe(remote);
		expect(output.map((child) => readCompiledIntrinsicReceipt(child)?.domain)).toEqual([
			remote,
			remote
		]);
		instance.unmount();
	});

	it('defaults ordinary roots to the page domain', () => {
		expect(
			(globalThis as Record<PropertyKey, unknown>)[Symbol.for('@exactjs/page-component-domain')]
		).toBe(pageComponentDomain);
		const instance = createFrameworkFixtureComponentInstance(() => () => null, {});
		expect(instance.domain).toBe(pageComponentDomain);
		instance.unmount();
	});

	it('keeps framework capabilities outside the public domain identity', () => {
		const domain = createFrameworkComponentDomain({
			executionRoot: 'page',
			dispatchContinuation: async () => undefined
		});
		expect(domain).toEqual({ executionRoot: 'page' });
		expect(Object.keys(domain)).toEqual(['executionRoot']);
		expect(componentDomainInspection(domain)).toBeUndefined();
	});
});
