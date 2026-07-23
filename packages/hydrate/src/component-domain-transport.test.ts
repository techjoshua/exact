/**
 * @vitest-environment jsdom
 */
import { createContext, createVNode, currentComponentDomain, type Component } from '@exactjs/core';
import { render, unmount } from '@exactjs/dom';
import { inspectDomRoot, type DomInspectionNode } from '@exactjs/dom/testing';
import { describe, expect, it, vi } from 'vitest';
import { createExactClient } from './index.js';

describe('component-domain transport', () => {
	it('emits immutable root, binding, and build metadata for every client operation', async () => {
		const container = document.createElement('div');
		const requests: Array<{ headers: Record<string, string>; body: unknown }> = [];
		const client = createExactClient(container, {
			endpoint: '/__exact',
			executionRoot: '@company/billing#./Area',
			binding: 'billing',
			buildKey: '0123456789abcdef0123456789abcdef01234567',
			headers: {
				'X-Exact-Binding': 'attacker-choice',
				'X-Exact-Build': 'ffffffffffffffffffffffffffffffffffffffff'
			},
			fetch: async (_input, init) => {
				requests.push({ headers: init.headers, body: JSON.parse(init.body) });
				return {
					ok: true,
					status: 200,
					async json() {
						return { ok: true, type: 'action', id: 'save' };
					}
				};
			}
		});

		await client.invokeAction('save');
		expect(client.domain.executionRoot).toBe('@company/billing#./Area');
		expect(requests).toEqual([
			{
				headers: expect.objectContaining({
					'X-Exact-Binding': 'billing',
					'X-Exact-Build': '0123456789abcdef0123456789abcdef01234567'
				}),
				body: expect.objectContaining({
					type: 'action',
					root: '@company/billing#./Area',
					id: 'save'
				})
			}
		]);
		client.dispose();
	});

	it('assigns the issuing client domain to islands registered after a remote response', () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<div data-exact-client-boundary="late" data-exact-client-name="Late" data-exact-client-props="{&quot;props&quot;:{}}"></div>';
		let setupRoot: string | undefined;
		function Late(this: Component<{}>) {
			setupRoot = currentComponentDomain()?.executionRoot;
			return () => 'Late';
		}
		const client = createExactClient(container, {
			executionRoot: '@company/billing#./Area'
		});
		client.registerManifest({ islands: { Late } });

		expect(setupRoot).toBe('@company/billing#./Area');
		expect(findComponentRoot(inspectDomRoot(container.firstElementChild!), 'Late')).toBe(
			'@company/billing#./Area'
		);
		client.dispose();
	});

	it('gives a late remote island live logical-parent context and disposes it with the client', () => {
		const container = document.createElement('div');
		const Profile = createContext<{ name: string }>('late-remote-profile');
		const unmounted = vi.fn();
		let host!: Component<{ profile: { name: string } }>;
		function Host(this: Component<{ profile: { name: string } }>) {
			host = this;
			this.state.profile = { name: 'Ada' };
			this.setContext(Profile, this.state.profile);
			return () =>
				createVNode(
					'section',
					null,
					createVNode(
						'div',
						{ id: 'remote-root' },
						createVNode('div', {
							'data-exact-client-boundary': 'late',
							'data-exact-client-name': 'Late',
							'data-exact-client-props': '{"props":{}}'
						})
					)
				);
		}
		function Late(this: Component<{}>) {
			const profile = this.getContext(Profile);
			this.onUnmount(unmounted);
			return () => createVNode('strong', null, profile.name);
		}
		render(createVNode(Host, null), container);
		const remoteRoot = container.querySelector('#remote-root')!;
		const client = createExactClient(remoteRoot, {
			executionRoot: '@company/billing#./Area'
		});
		client.registerManifest({ islands: { Late } });

		expect(remoteRoot.textContent).toBe('Ada');
		host.state.profile.name = 'Grace';
		expect(remoteRoot.textContent).toBe('Grace');
		client.dispose();
		expect(unmounted).toHaveBeenCalledOnce();
		unmount(container);
	});
});

function findComponentRoot(node: DomInspectionNode | undefined, name: string): string | undefined {
	if (!node) return undefined;
	if (node.instance?.type.name === name) return node.instance.domain.executionRoot;
	for (const child of node.children) {
		const found = findComponentRoot(child, name);
		if (found) return found;
	}
	return undefined;
}
