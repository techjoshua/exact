/**
 * @vitest-environment jsdom
 */
import { createContext, createVNode, type Component, type ComponentInstance } from '@exact/core';
import { render, unmount } from '@exact/dom';
import { describe, expect, it } from 'vitest';
import { createExactClient, requestClientForComponentDomain } from './client.js';
import { createExactRoot } from './root.js';

describe('hidden exact roots', () => {
	it('selects request clients by instantiating root while preserving authored child ownership', () => {
		const container = document.createElement('div');
		const pageClient = createExactClient(container, { executionRoot: 'page' });
		const remoteClient = createExactClient(document.createElement('div'), {
			executionRoot: '@company/branding#./Shell'
		});
		const Theme = createContext<{ name: string }>('hidden-root-theme', { reactive: true });
		let pageChild!: ComponentInstance<any>;
		let remoteShell!: ComponentInstance<any>;
		let remoteButton!: ComponentInstance<any>;

		function SharedButton(this: Component<{}>) {
			remoteButton = this as ComponentInstance<any>;
			const theme = this.getContext(Theme);
			return () => createVNode('button', null, theme.name);
		}

		function PageChild(this: Component<{}>) {
			pageChild = this as ComponentInstance<any>;
			const theme = this.getContext(Theme);
			return () => createVNode('strong', null, theme.name);
		}

		function RemoteShell(this: Component<{}>, props: { children?: unknown }) {
			remoteShell = this as ComponentInstance<any>;
			return () => createVNode('section', null, createVNode(SharedButton, null), props.children);
		}

		function Page(this: Component<{ theme: { name: string } }>) {
			this.state.theme = { name: 'violet' };
			this.setContext(Theme, this.state.theme);
			const child = createVNode(PageChild, null);
			const remote = createExactRoot(remoteClient, RemoteShell, undefined, child);
			return () => remote;
		}

		render(createExactRoot(pageClient, Page), container);

		expect(container.textContent).toBe('violetviolet');
		expect(pageChild.domain).toBe(pageClient.domain);
		expect(remoteShell.domain).toBe(remoteClient.domain);
		expect(remoteButton.domain).toBe(remoteClient.domain);
		expect(requestClientForComponentDomain(pageChild.domain)).toBe(pageClient);
		expect(requestClientForComponentDomain(remoteShell.domain)).toBe(remoteClient);
		expect(requestClientForComponentDomain(remoteButton.domain)).toBe(remoteClient);

		unmount(container);
		pageClient.dispose();
		remoteClient.dispose();
	});
});
