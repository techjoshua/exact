/**
 * @vitest-environment jsdom
 */
import {
	createComponentDomain,
	createContext,
	createExactRuntimeInspectionOwner,
	currentComponentDomain,
	withComponentDomain,
	type Component
} from '@exactjs/core';
import { componentDomainInspection } from '@exactjs/core/framework/component-domains';
import { describe, expect, it, vi } from 'vitest';
import { findNodeOwnerInstance, render, unmount } from './index.js';
import { inspectDomRoot } from './testing.js';
import { createCompiledVNode, createVNode } from './test-support/native-vnode.js';

describe('component domain rendering', () => {
	it('instantiates the same component function under the VNode owner domain', () => {
		const container = document.createElement('div');
		const page = createComponentDomain({ executionRoot: 'page' });
		const remote = createComponentDomain({ executionRoot: '@company/branding#./Button' });
		function Button(this: Component<{}>) {
			const executionRoot = currentComponentDomain()!.executionRoot;
			return () => createVNode('button', null, executionRoot);
		}
		function Host() {
			const pageButton = withComponentDomain(page, () => createVNode(Button, null));
			const remoteButton = withComponentDomain(remote, () => createVNode(Button, null));
			return () => createVNode('section', null, pageButton, remoteButton);
		}

		render(createVNode(Host, null), container);
		const buttons = Array.from(container.querySelectorAll('button'));
		expect(buttons.map((button) => button.textContent)).toEqual([
			'page',
			'@company/branding#./Button'
		]);
		unmount(container);
	});

	it('replaces rather than reuses an instance when immutable ownership changes', () => {
		const container = document.createElement('div');
		const unmounted = vi.fn();
		const page = createComponentDomain({ executionRoot: 'page' });
		const remote = createComponentDomain({ executionRoot: '@company/billing#./Area' });
		function Area(this: Component<{}>) {
			this.onUnmount(unmounted);
			const executionRoot = currentComponentDomain()!.executionRoot;
			return () => createVNode('span', null, executionRoot);
		}
		const vnode = (domain: typeof page) =>
			withComponentDomain(domain, () => createVNode(Area, { key: 'area' }));

		render(vnode(page), container);
		const first = inspectDomRoot(container)?.children[0]?.instance;
		render(vnode(remote), container);
		const second = inspectDomRoot(container)?.children[0]?.instance;
		expect(second).not.toBe(first);
		expect(container.textContent).toBe('@company/billing#./Area');
		expect(unmounted).toHaveBeenCalledOnce();
		unmount(container);
	});

	it('reparents a parked page instance while preserving captured context handles', () => {
		const container = document.createElement('div');
		const Tone = createContext<{ name: string }>('cross-root-tone');
		const page = createComponentDomain({ executionRoot: 'page' });
		const firstRemote = createComponentDomain({ executionRoot: '@company/branding#./Shell' });
		const secondRemote = createComponentDomain({ executionRoot: '@company/branding#./Shell' });
		const mounted = vi.fn();
		const unmounted = vi.fn();
		let pageChild!: Component<{ showDescendant: boolean }>;
		function Descendant(this: Component<{}>) {
			const current = this.getContext(Tone);
			return () => createVNode('i', null, current.name);
		}
		function PageChild(this: Component<{ showDescendant: boolean }>) {
			pageChild = this;
			this.state.showDescendant = false;
			const captured = this.getContext(Tone);
			this.onMount(mounted);
			this.onUnmount(unmounted);
			return () =>
				createVNode(
					'strong',
					null,
					captured.name,
					this.state.showDescendant ? createVNode(Descendant, null) : null
				);
		}
		const pageVNode = withComponentDomain(page, () => createVNode(PageChild, null));
		function Shell(this: Component<{}>, props: { tone: string }) {
			this.setContext(Tone, { name: props.tone });
			return () => createVNode('section', null, pageVNode);
		}
		const shell = (domain: typeof firstRemote, tone: string) =>
			withComponentDomain(domain, () => createVNode(Shell, { tone }));

		render(shell(firstRemote, 'first'), container);
		const before = inspectDomRoot(container)?.children[0]?.instance;
		const pageBefore = pageChild;
		render(shell(secondRemote, 'second'), container);
		const after = inspectDomRoot(container)?.children[0]?.instance;
		expect(after).not.toBe(before);
		expect(pageChild).toBe(pageBefore);
		expect(container.textContent).toBe('first');
		expect(mounted).toHaveBeenCalledOnce();
		expect(unmounted).not.toHaveBeenCalled();

		pageChild.state.showDescendant = true;
		expect(container.textContent).toBe('firstsecond');
		expect(mounted).toHaveBeenCalledOnce();
		expect(unmounted).not.toHaveBeenCalled();
		unmount(container);
		expect(unmounted).toHaveBeenCalledOnce();
	});

	it('resolves logical ownership through host ancestors and releases it on unmount', () => {
		const container = document.createElement('div');
		let panel!: Component<{}>;
		function Panel(this: Component<{}>) {
			panel = this;
			return () =>
				createVNode(
					'section',
					null,
					createVNode('button', null, createVNode('span', null, 'Save'))
				);
		}

		render(createVNode(Panel, null), container);
		const text = container.querySelector('span')!.firstChild!;
		expect(findNodeOwnerInstance(text)).toBe(panel);

		expect(unmount(container)).toBe(true);
		expect(findNodeOwnerInstance(text)).toBeUndefined();
	});

	it('carries a root inspection domain through a compiled VNode cell', () => {
		const container = document.createElement('div');
		const inspection = createExactRuntimeInspectionOwner({
			buildKey: 'compiled-root',
			executionRoot: 'page'
		});
		function Panel() {
			return () => createVNode('button', null, 'Inspect');
		}

		render(createCompiledVNode(Panel, null), container, { inspection });

		const button = container.querySelector('button')!;
		const instance = findNodeOwnerInstance(button);
		expect(instance && componentDomainInspection(instance.domain)).toBe(inspection);
		unmount(container);
	});
});
