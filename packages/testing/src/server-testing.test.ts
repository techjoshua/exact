/**
 * @vitest-environment jsdom
 */
import { createContext, type Component } from '@exactjs/core';
import { lazyClientIsland, readExactHydrationConfig } from '@exactjs/hydrate';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import { renderToString } from '@exactjs/ssr';
import { describe, expect, it } from 'vitest';

import { ExactProtocolRecorder, mountClientServerTest, testServerComponent } from './index.js';
import { createTestOperation as createOperation, markTestComponent } from './internal/fixtures.js';

import {
	ApplicationName,
	RequestName,
	Theme
} from './test-support/server-contexts.fixtures.test.js';
import {
	Page,
	Child,
	ServerPage,
	ReadyPage,
	Tree,
	Group,
	Leaf,
	Cleanup,
	disposalCount
} from './test-support/server.fixtures.test.js?exact-target=server';

describe('server component testing', () => {
	it('captures before disposal and releases failed renders without poisoning the next request', async () => {
		const before = disposalCount();
		await expect(testServerComponent(Cleanup).props({ fail: true }).render()).rejects.toThrow(
			'fixture render failure'
		);
		expect(disposalCount()).toBe(before + 1);
		const view = await testServerComponent(Cleanup).props({ fail: false }).render();
		expect(view.root.state()).toEqual({ value: 'Ready' });
		expect(disposalCount()).toBe(before + 2);
	});
	it('preserves stateless parents, preorder, and distinct repeated component identities', async () => {
		const view = await testServerComponent(Tree).render();
		const ordinary = await renderToString(createCompiledComponentReceipt(Tree, {}));
		expect(view.html).toBe(ordinary.html);
		expect(view.allComponents().map((c) => c.type)).toEqual([Tree, Group, Leaf, Leaf]);
		const group = view.root.child(Group);
		const leaves = group.children(Leaf);
		expect(leaves.map((c) => c.state())).toEqual([{ label: 'One' }, { label: 'Two' }]);
		expect(leaves[0]!.id).not.toBe(leaves[1]!.id);
		expect(leaves[0]!.parent()).toBe(group);
	});
	it('captures settled state and inherited, provided, application, and request contexts', async () => {
		const view = await testServerComponent(Page)
			.props({ label: 'Profile' })
			.applicationContext(ApplicationName, 'Northwind')
			.requestContext(RequestName, 'Ada')
			.render();

		expect(view.html).toContain('Northwind:Ada:dark');
		expect(view.root.state()).toEqual({ ready: true });
		expect(view.root.props()).toMatchObject({ label: 'Profile' });
		expect(view.root.providedContext(Theme)).toBe('dark');
		expect(view.root.context(ApplicationName)).toBe('Northwind');
		expect(view.applicationContext(ApplicationName)).toBe('Northwind');
		expect(view.requestContext(RequestName)).toBe('Ada');
		expect(view.root.child(Child).context(Theme)).toBe('dark');
		expect(view.root.child(Child).state()).toEqual({ summary: 'Northwind:Ada:dark' });
	});

	it('records opaque operations, responses, and their client-side disposition', async () => {
		const ClientTheme = createContext<string>('test.client-theme');
		function ClientChild(this: Component<{}>) {
			const theme = this.getContext(ClientTheme);
			return () => createOperation('button', { 'data-theme': theme }, 'Save');
		}
		function ClientIsland(this: Component<{}>) {
			this.setContext(ClientTheme, 'ocean');
			return () => createOperation(ClientChild, {});
		}
		markTestComponent(ClientIsland);
		const server = await testServerComponent(ServerPage).render({
			hydration: { endpoint: '/__exact' }
		});
		const view = await mountClientServerTest({
			server,
			islands: {
				ClientIsland: lazyClientIsland(async () => {
					await new Promise((resolve) => setTimeout(resolve, 10));
					return ClientIsland;
				})
			},
			hydrate: {
				allowMarkerless: true,
				batch: false,
				continuations: {
					'generated-action-7f3a': {
						id: 'generated-action-7f3a',
						componentId: 'component:ClientIsland',
						kind: 'task',
						readiness: 'nonblocking',
						dependencies: [],
						stateReads: [],
						stateWrites: [{ path: 'saved', kind: 'write', confidence: 'exact' }],
						publicContexts: [],
						serverContexts: [],
						contextWrites: [],
						boundaries: []
					}
				}
			},
			handle: async (request) => {
				expect(request.body).toMatchObject({
					type: 'invoke',
					id: 'generated-action-7f3a'
				});
				return {
					status: 200,
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						ok: true,
						type: 'invoke',
						id: 'generated-action-7f3a',
						state: { saved: true },
						patches: []
					})
				};
			}
		});

		expect(view.hydratedIslands).toBe(1);
		expect(view.hydration).toEqual([
			{
				kind: 'island',
				outcome: 'mounted',
				component: 'ClientIsland',
				markers: 'none'
			}
		]);
		await view.client.invokeTask('generated-action-7f3a');
		await view.settle();

		expect(view.protocol.operations()).toEqual([
			expect.objectContaining({ type: 'invoke', id: 'generated-action-7f3a' })
		]);
		expect(view.protocol.exchanges[0]?.response?.body).toMatchObject({
			state: { saved: true }
		});
		expect(view.protocol.exchanges[0]?.clientOperations[0]).toMatchObject({
			patchesApplied: true,
			stale: false
		});
		expect(view.getByRole('button', { name: 'Save' })).toBeDefined();
		expect(view.component(ClientIsland).providedContext(ClientTheme)).toBe('ocean');
		expect(view.component(ClientChild).context(ClientTheme)).toBe('ocean');
		view.unmount();
	});

	it('exposes the exact public SSR resumption activations emitted to hydration', async () => {
		const activation = {
			componentId: 'component:Page',
			values: { count: 3 },
			contexts: { PublicStatus: 'ready' },
			settledContinuations: ['task:load']
		} as const;

		const view = await testServerComponent(ReadyPage).render({
			hydration: { resumptions: [activation] }
		});

		expect(view.resumptions).toEqual([activation]);
		if (!view.hydrationScript) throw new Error('SSR resumption render omitted hydration state');
		const container = document.createElement('div');
		container.innerHTML = view.hydrationScript;
		expect(readExactHydrationConfig(container).resumptions).toEqual([
			[activation.componentId, [['count', 3]], [['PublicStatus', 'ready']], ['task:load']]
		]);
	});

	it('records consumed protocol events without changing client bytes', async () => {
		const encoder = new TextEncoder();
		const recorder = new ExactProtocolRecorder();
		const fetch = recorder.wrap(async () => ({
			ok: true,
			status: 200,
			body: new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(encoder.encode('{"event":"start"}\n'));
					controller.enqueue(encoder.encode('{"event":"result","id":"opaque"}\n'));
					controller.close();
				}
			}),
			json: async () => ({})
		}));

		const response = await fetch('/__exact', {
			method: 'POST',
			headers: {},
			body: JSON.stringify({ type: 'invoke', id: 'opaque' })
		});
		expect(await new Response(response.body).text()).toBe(
			'{"event":"start"}\n{"event":"result","id":"opaque"}\n'
		);
		await recorder.settle();

		expect(recorder.exchanges[0]?.response?.events).toEqual([
			{ event: 'start' },
			{ event: 'result', id: 'opaque' }
		]);
	});

	it('correlates value-free server context token access with opaque operations', async () => {
		const recorder = new ExactProtocolRecorder();
		const fetch = recorder.wrap(async () => {
			recorder.observeServerContextAccess({
				operationId: 'generated-action-7f3a',
				componentId: 'component:Page',
				token: 'DatabaseContext',
				scope: 'request'
			});
			return {
				ok: true,
				status: 200,
				json: async () => ({ ok: true })
			};
		});

		await fetch('/__exact', {
			method: 'POST',
			headers: {},
			body: JSON.stringify({ type: 'invoke', id: 'generated-action-7f3a' })
		});

		expect(recorder.serverContextAccesses()).toEqual([
			{
				operationId: 'generated-action-7f3a',
				componentId: 'component:Page',
				token: 'DatabaseContext',
				scope: 'request'
			}
		]);
		expect(JSON.stringify(recorder.exchanges)).not.toContain('connectionString');
	});
});
