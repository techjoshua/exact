/**
 * @vitest-environment jsdom
 */
import { activateTaskForHost, createContext, defineTask, type Component } from '@exactjs/core';
import { describe, expect, it } from 'vitest';

import { ExactProtocolRecorder, mountClientServerTest, testServerComponent } from './index.js';
import { createTestVNode as createVNode, markTestComponent } from './internal/fixtures.js';

describe('server component testing', () => {
	it('captures settled state and inherited, provided, application, and request contexts', async () => {
		const ApplicationName = createContext<string>('test.application', {
			scope: 'application'
		});
		const RequestName = createContext<string>('test.request', { scope: 'request' });
		const Theme = createContext<string>('test.theme');

		function Child(this: Component<{ summary: string }>) {
			this.state.summary = `${this.getContext(ApplicationName)}:${this.getContext(
				RequestName
			)}:${this.getContext(Theme)}`;
			return () => createVNode('span', null, this.state.summary);
		}
		function Page(this: Component<{ ready: boolean }>, props: { label: string }) {
			this.state.ready = false;
			this.setContext(Theme, 'dark');
			activateTaskForHost(
				this,
				defineTask({}, async () => {
					await Promise.resolve();
					this.state.ready = true;
				})
			);
			return () =>
				createVNode('main', null, props.label, this.state.ready ? createVNode(Child, {}) : null);
		}

		const view = await testServerComponent(markTestComponent(Page))
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
		function ServerPage() {
			return () =>
				createVNode('div', {
					'data-exact-client-boundary': 'island-opaque',
					'data-exact-client-name': 'ClientIsland',
					'data-exact-client-props': JSON.stringify({ props: {} })
				});
		}
		function ClientChild(this: Component<{}>) {
			const theme = this.getContext(ClientTheme);
			return () => createVNode('button', { 'data-theme': theme }, 'Save');
		}
		function ClientIsland(this: Component<{}>) {
			this.setContext(ClientTheme, 'ocean');
			return () => createVNode(ClientChild, {});
		}
		markTestComponent(ClientIsland);
		const server = await testServerComponent(markTestComponent(ServerPage)).render({
			hydration: { endpoint: '/__exact' }
		});
		const view = await mountClientServerTest({
			server,
			islands: { ClientIsland },
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
		function Page() {
			return () => createVNode('main', null, 'Ready');
		}
		const activation = {
			componentId: 'component:Page',
			values: { count: 3 },
			contexts: { PublicStatus: 'ready' },
			settledContinuations: ['task:load']
		} as const;

		const view = await testServerComponent(markTestComponent(Page)).render({
			hydration: { resumptions: [activation] }
		});

		expect(view.resumptions).toEqual([activation]);
		expect(view.hydrationScript).toContain('"PublicStatus":"ready"');
	});

	it('records streamed protocol events without consuming the client stream', async () => {
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

		await fetch('/__exact', {
			method: 'POST',
			headers: {},
			body: JSON.stringify({ type: 'invoke', id: 'opaque' })
		});
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
