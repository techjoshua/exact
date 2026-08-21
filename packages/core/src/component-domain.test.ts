import { describe, expect, it } from 'vitest';
import type { Component } from './index.js';
import {
	createComponentDomain,
	createVNode,
	isVNode,
	pageComponentDomain,
	withComponentDomain
} from './index.js';
import { createComponentInstance, renderInstance } from './runtime/render.js';
import { componentDomainInspection, createFrameworkComponentDomain } from './component/domain.js';

describe('component domains', () => {
	it('captures the active immutable domain on authored VNodes', () => {
		const remote = createComponentDomain({ executionRoot: '@company/billing#./Area' });
		const vnode = withComponentDomain(remote, () => createVNode('section', null));
		expect(vnode.domain).toBe(remote);
		expect(() => {
			(vnode.domain as { executionRoot: string }).executionRoot = 'other';
		}).toThrow();
	});

	it('uses the instance domain during setup and every render', () => {
		const remote = createComponentDomain({ executionRoot: '@company/billing#./Area' });
		function Area(this: Component<{ count: number }>) {
			this.state.count = 1;
			const setup = createVNode('span', { phase: 'setup' });
			return () => [setup, createVNode('span', { count: this.state.count })];
		}
		const instance = createComponentInstance(Area, {}, undefined, undefined, remote);
		const output = renderInstance(instance, () => undefined);
		expect(instance.domain).toBe(remote);
		expect(output.map((child) => (isVNode(child) ? child.domain : undefined))).toEqual([
			remote,
			remote
		]);
		instance.unmount();
	});

	it('defaults ordinary roots to the page domain', () => {
		expect(
			(globalThis as Record<PropertyKey, unknown>)[
				Symbol.for('@exactjs/page-component-domain')
			]
		).toBe(pageComponentDomain);
		const instance = createComponentInstance(() => () => null, {});
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
