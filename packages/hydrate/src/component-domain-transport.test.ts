/**
 * @vitest-environment jsdom
 */
import {
	Suspense,
	createContext,
	currentComponentDomain,
	dispatchComponentContinuation,
	withComponentDomain,
	type Component,
	type ComponentInstance
} from '@exactjs/core';
import { createVNode, markTestComponents } from './test-support/native-vnode.js';
import { render, unmount } from '@exactjs/dom';
import { inspectDomRoot, type DomInspectionNode } from '@exactjs/dom/testing';
import { describe, expect, it, vi } from 'vitest';
import { createExactClient, hydrate } from './index.js';
import { testContinuation } from './test-support/responses.js';

describe('component-domain transport', () => {
	it('commits a blocking continuation response through its Suspense readiness generation', async () => {
		const container = document.createElement('div');
		const continuation = testContinuation('load-options', {
			readiness: 'blocking',
			writes: [{ path: 'result', kind: 'write', confidence: 'exact' }]
		});
		function Options(this: Component<{ result: string }>) {
			this.state.result = 'waiting';
			(this as any).task.blocking(({ signal }: { signal: AbortSignal }) =>
				dispatchComponentContinuation(
					this as unknown as ComponentInstance<{ result: string }>,
					'load-options',
					[],
					signal
				)
			);
			return () => createVNode('output', null, this.state.result);
		}
		const client = createExactClient(container, {
			endpoint: '/__exact',
			batch: false,
			continuations: { 'load-options': continuation },
			fetch: async () => ({
				ok: true,
				status: 200,
				async json() {
					return {
						ok: true,
						type: 'action' as const,
						id: 'load-options',
						state: { result: 'Ground' }
					};
				}
			})
		});

		render(
			withComponentDomain(client.domain, () =>
				createVNode(
					Suspense,
					{ fallback: createVNode('i', null, 'Loading') },
					createVNode(Options, {})
				)
			),
			container
		);
		expect(container.textContent).toBe('Loading');

		await client.whenSettled();
		await vi.waitFor(() => expect(container.textContent).toBe('Ground'));
		client.dispose();
	});

	it('commits compiler-mapped public context writes to the owning component', async () => {
		const StatusContext = createContext<{ message: string }>('status', {
			global: true,
			keep: 'shared'
		});
		const container = document.createElement('div');
		const continuation = testContinuation('publish-status', {
			contextWrites: ['StatusContext']
		});
		function Status(this: Component<{}>) {
			return () => createVNode('output', null, this.getContext(StatusContext).message);
		}
		function Provider(this: Component<{}>) {
			this.setContext(StatusContext, { message: 'initial' });
			(this as any).task(({ signal }: { signal: AbortSignal }) =>
				dispatchComponentContinuation(
					this as unknown as ComponentInstance<{}>,
					'publish-status',
					[],
					signal,
					[{ name: 'StatusContext', token: StatusContext }]
				)
			);
			return () => createVNode(Status, {});
		}
		const client = createExactClient(container, {
			endpoint: '/__exact',
			batch: false,
			continuations: { 'publish-status': continuation },
			fetch: async () => ({
				ok: true,
				status: 200,
				async json() {
					return {
						ok: true,
						type: 'action' as const,
						id: 'publish-status',
						contexts: { StatusContext: { message: 'updated' } }
					};
				}
			})
		});

		render(
			withComponentDomain(client.domain, () => createVNode(Provider, {})),
			container
		);
		await client.whenSettled();

		await vi.waitFor(() => expect(container.querySelector('output')?.textContent).toBe('updated'));
		client.dispose();
	});

	it('owns component continuations before constructing the hydrated tree', async () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<!--exact:component:Search--><output>waiting</output><!--/exact:component:Search-->';
		const requests: unknown[] = [];
		const continuation = testContinuation('load', {
			dependencies: [{ source: 'state' }],
			reads: [{ path: 'query', kind: 'read', confidence: 'exact' }],
			writes: [{ path: 'result', kind: 'write', confidence: 'exact' }]
		});
		function Search(this: Component<{ query: string; result: string }>) {
			this.state.query = 'first';
			this.state.result = 'waiting';
			(this as any).task(
				this.reactive(() => this.state.query),
				(query: string, { signal }: { signal: AbortSignal }) =>
					dispatchComponentContinuation(
						this as unknown as ComponentInstance<{ query: string; result: string }>,
						'load',
						[query],
						signal
					)
			);
			return () => createVNode('output', null, this.state.result);
		}
		const client = hydrate(createVNode(Search, {}), container, {
			endpoint: '/__exact',
			batch: false,
			continuations: { load: continuation },
			fetch: async (_input, init) => {
				requests.push(JSON.parse(init.body));
				return {
					ok: true,
					status: 200,
					async json() {
						return {
							ok: true,
							type: 'action' as const,
							id: 'load',
							state: { result: 'FIRST' }
						};
					}
				};
			}
		});

		await client.whenSettled();

		expect(requests).toEqual([
			expect.objectContaining({
				payload: { dependencies: ['first'] },
				state: { query: 'first' }
			})
		]);
		expect(container.querySelector('output')?.textContent).toBe('FIRST');
		client.dispose();
	});

	it('emits immutable root, binding, and build metadata for every client operation', async () => {
		const container = document.createElement('div');
		const requests: Array<{ headers: Record<string, string>; body: unknown }> = [];
		const client = createExactClient(container, {
			endpoint: '/__exact',
			executionRoot: '@company/billing#./Area',
			binding: 'billing',
			buildKey: '0123456789abcdef0123456789abcdef01234567',
			continuations: { save: testContinuation('save') },
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
		client.registerComponents({ islands: markTestComponents({ Late }) });

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
		client.registerComponents({ islands: markTestComponents({ Late }) });

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
