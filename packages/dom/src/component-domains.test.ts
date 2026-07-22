/**
 * @vitest-environment jsdom
 */
import {
	createComponentDomain,
	createContext,
	createVNode,
	currentComponentDomain,
	withComponentDomain,
	type Component
} from '@exact/core';
import { describe, expect, it, vi } from 'vitest';
import { render, unmount } from './index.js';
import { inspectDomRoot } from './testing.js';

describe('component domain rendering', () => {
	it('instantiates the same component function under the VNode owner domain', () => {
		const container = document.createElement('div');
		const page = createComponentDomain('page');
		const remote = createComponentDomain('@company/branding#./Button');
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
		const page = createComponentDomain('page');
		const remote = createComponentDomain('@company/billing#./Area');
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
		const page = createComponentDomain('page');
		const firstRemote = createComponentDomain('@company/branding#./Shell');
		const secondRemote = createComponentDomain('@company/branding#./Shell');
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
});
