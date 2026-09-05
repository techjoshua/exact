/**
 * @vitest-environment jsdom
 */
import '@exactjs/dom/structural-boundaries';
import { renderToHydratableString } from '@exactjs/ssr';
import { flushSync } from '@exactjs/reactive';
import { render, unmount } from '@exactjs/dom';
import { inspectDomRoot, type DomInspectionNode } from '@exactjs/dom/testing';
import { describe, expect, it, vi } from 'vitest';
import { createExactClient, hydrate } from './index.js';
import { testContinuation } from './test-support/responses.js';
import { transportSearchRoot as serverTransportSearchRoot } from './test-support/component-domain-transport.fixtures.js?exact-target=server';
import {
	blockingOptionsRoot,
	ContextLateIsland,
	DomainLateIsland,
	lateIslandHostRoot,
	mountedLateHost,
	readLateSetupRoot,
	readLateUnmounts,
	resetLateUnmounts,
	transportSearchRoot,
	transportStatusRoot
} from './test-support/component-domain-transport.fixtures.js';

describe('component-domain transport', () => {
	it('commits a blocking continuation response through its Suspense readiness generation', async () => {
		const container = document.createElement('div');
		let releaseResponse!: () => void;
		let requested = false;
		const responseGate = new Promise<void>((resolve) => (releaseResponse = resolve));
		const continuation = testContinuation('load-options', {
			readiness: 'blocking',
			writes: [{ path: 'result', kind: 'write', confidence: 'exact' }]
		});
		const client = createExactClient(container, {
			endpoint: '/__exact',
			batch: false,
			continuations: { 'load-options': continuation },
			fetch: async () => {
				requested = true;
				await responseGate;
				return {
					ok: true,
					status: 200,
					async json() {
						return {
							ok: true,
							type: 'invoke' as const,
							id: 'load-options',
							state: { result: 'Ground' }
						};
					}
				};
			}
		});

		render(blockingOptionsRoot, container, { componentDomain: client.domain });
		await vi.waitFor(() => expect(container.textContent).toBe('Loading'));
		await vi.waitFor(() => expect(requested).toBe(true));

		releaseResponse();
		await client.whenSettled();
		await vi.waitFor(() => expect(container.textContent).toBe('Ground'));
		client.dispose();
	});

	it('commits compiler-mapped public context writes to the owning component', async () => {
		const container = document.createElement('div');
		const continuation = testContinuation('publish-status', {
			contextWrites: ['StatusContext']
		});
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
						type: 'invoke' as const,
						id: 'publish-status',
						contexts: { StatusContext: { message: 'updated' } }
					};
				}
			})
		});

		render(transportStatusRoot, container, { componentDomain: client.domain });
		await vi.waitFor(() => expect(client.pendingRequests).toBe(1));
		await client.whenSettled();
		flushSync();

		await vi.waitFor(() => expect(container.querySelector('output')?.textContent).toBe('updated'));
		client.dispose();
	});

	it('owns component continuations before constructing the hydrated tree', async () => {
		const container = document.createElement('div');
		container.innerHTML = renderToHydratableString(serverTransportSearchRoot).htmlWithHydration;
		const requests: unknown[] = [];
		const continuation = testContinuation('load', {
			dependencies: [{ source: 'state' }],
			reads: [{ path: 'query', kind: 'read', confidence: 'exact' }],
			writes: [{ path: 'result', kind: 'write', confidence: 'exact' }]
		});
		const client = hydrate(transportSearchRoot, container, {
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
							type: 'invoke' as const,
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
		await vi.waitFor(() => expect(container.querySelector('output')?.textContent).toBe('FIRST'));
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
						return { ok: true, type: 'invoke', id: 'save' };
					}
				};
			}
		});

		await client.invokeTask('save');
		expect(client.domain.executionRoot).toBe('@company/billing#./Area');
		expect(requests).toEqual([
			{
				headers: expect.objectContaining({
					'X-Exact-Binding': 'billing',
					'X-Exact-Build': '0123456789abcdef0123456789abcdef01234567'
				}),
				body: expect.objectContaining({
					type: 'invoke',
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
		const client = createExactClient(container, {
			executionRoot: '@company/billing#./Area'
		});
		client.registerComponents({ islands: { Late: DomainLateIsland } });

		expect(readLateSetupRoot()).toBe('@company/billing#./Area');
		expect(
			findComponentRoot(inspectDomRoot(container.firstElementChild!), 'DomainLateIsland')
		).toBe('@company/billing#./Area');
		client.dispose();
	});

	it('gives a late remote island live logical-parent context and disposes it with the client', () => {
		const container = document.createElement('div');
		resetLateUnmounts();
		render(lateIslandHostRoot, container);
		const remoteRoot = container.querySelector('#remote-root')!;
		const client = createExactClient(remoteRoot, {
			executionRoot: '@company/billing#./Area'
		});
		client.registerComponents({ islands: { Late: ContextLateIsland } });

		expect(remoteRoot.textContent).toBe('Ada');
		mountedLateHost().state.profile.name = 'Grace';
		flushSync();
		expect(remoteRoot.textContent).toBe('Grace');
		client.dispose();
		expect(readLateUnmounts()).toBe(1);
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
