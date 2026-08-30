import { createFrameworkFixtureComponentInstance } from './testing.js';
import { describe, expect, it } from 'vitest';
import type { Component } from './index.js';
import { createComponentDomain, pageComponentDomain, withComponentDomain } from './index.js';
import { executeCompiledComponentOutput } from './component/compiled-output.js';
import {
	createCompiledIntrinsicReceipt,
	readCompiledIntrinsicReceipt
} from './component-abi/intrinsic-receipt.js';
import { componentDomainInspection, createFrameworkComponentDomain } from './component/domain.js';

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
