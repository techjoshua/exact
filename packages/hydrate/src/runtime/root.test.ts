/**
 * @vitest-environment jsdom
 */
import {
	type AnyComponentInstance,
	createComponentDomain,
	createContext,
	type Component
} from '@exactjs/core';
import { render, unmount } from '@exactjs/dom';
import { describe, expect, it } from 'vitest';
import { createExactClient, requestClientForComponentDomain } from './client.js';
import { createExactRoot } from './root.js';
import { createVNode, markTestComponent } from '../test-support/native-vnode.js';

describe('hidden exact roots', () => {
	it('selects request clients by instantiating root while preserving authored child ownership', () => {
		const container = document.createElement('div');
		const pageClient = createExactClient(container, { executionRoot: 'page' });
		const remoteClient = createExactClient(document.createElement('div'), {
			executionRoot: '@company/branding#./Shell'
		});
		const Theme = createContext<{ name: string }>('hidden-root-theme', { reactive: true });
		let pageChild!: AnyComponentInstance;
		let remoteShell!: AnyComponentInstance;
		let remoteButton!: AnyComponentInstance;

		function SharedButton(this: Component<{}>) {
			remoteButton = this as AnyComponentInstance;
			const theme = this.getContext(Theme);
			return () => createVNode('button', null, theme.name);
		}

		function PageChild(this: Component<{}>) {
			pageChild = this as AnyComponentInstance;
			const theme = this.getContext(Theme);
			return () => createVNode('strong', null, theme.name);
		}

		function RemoteShell(this: Component<{}>, props: { children?: unknown }) {
			remoteShell = this as AnyComponentInstance;
			return () => createVNode('section', null, createVNode(SharedButton, null), props.children);
		}

		function Page(this: Component<{ theme: { name: string } }>) {
			this.state.theme = { name: 'violet' };
			this.setContext(Theme, this.state.theme);
			const child = createVNode(PageChild, null);
			const remote = createExactRoot(
				remoteClient,
				markTestComponent(RemoteShell),
				undefined,
				child
			);
			return () => remote;
		}

		render(createExactRoot(pageClient, markTestComponent(Page)), container);

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

	it('releases every rotated domain and refuses to revive a disposed client', () => {
		const container = document.createElement('div');
		const client = createExactClient(container, { executionRoot: '@company/area#./Root' });
		const rotated = createComponentDomain({ executionRoot: '@company/area#./Root' });
		function Area() {
			return () => createVNode('p', null, 'area');
		}

		createExactRoot(client, Area, undefined, undefined, rotated);
		expect(requestClientForComponentDomain(client.domain)).toBe(client);
		expect(requestClientForComponentDomain(rotated)).toBe(client);

		client.dispose();
		expect(requestClientForComponentDomain(client.domain)).toBeUndefined();
		expect(requestClientForComponentDomain(rotated)).toBeUndefined();
		expect(() => createExactRoot(client, Area)).toThrow('inactive eXact client');

		const replacement = createExactClient(container, { executionRoot: '@company/area#./Root' });
		expect(replacement.domain).not.toBe(client.domain);
		expect(requestClientForComponentDomain(replacement.domain)).toBe(replacement);
		replacement.dispose();
	});
});
