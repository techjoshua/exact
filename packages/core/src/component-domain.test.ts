import { describe, expect, it } from 'vitest';
import type { Component } from './index.js';
import {
	createComponentDomain,
	createComponentInstance,
	createVNode,
	isVNode,
	pageComponentDomain,
	renderInstance,
	withComponentDomain
} from './index.js';

describe('component domains', () => {
	it('captures the active immutable domain on authored VNodes', () => {
		const remote = createComponentDomain('@company/billing#./Area');
		const vnode = withComponentDomain(remote, () => createVNode('section', null));
		expect(vnode.domain).toBe(remote);
		expect(() => {
			(vnode.domain as { executionRoot: string }).executionRoot = 'other';
		}).toThrow();
	});

	it('uses the instance domain during setup and every render', () => {
		const remote = createComponentDomain('@company/billing#./Area');
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
		const instance = createComponentInstance(() => null, {});
		expect(instance.domain).toBe(pageComponentDomain);
		instance.unmount();
	});
});
