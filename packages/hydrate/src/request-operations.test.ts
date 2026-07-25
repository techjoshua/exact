/**
 * @vitest-environment jsdom
 */
import { Fragment, createVNode } from '@exactjs/core';
import { render } from '@exactjs/dom';
import {
	defineExactBoundaryContract,
	handleExactRequest
} from '@exactjs/server';
import { describe, expect, it } from 'vitest';
import {
	applyPatches,
	createExactClient,
	hydrate,
	invokeExact,
	invokeExactBatch,
	readExactHydrationConfig
} from './index.js';
import { noopLogger, testContinuation } from './test-support/responses.js';

describe('@exactjs/hydrate request-operations', () => {
	it('keeps unrelated client ownership active after a server prop patch', () => {
		let clicks = 0;
		function Counter() {
			return () => createVNode('button', { onClick: () => clicks++ }, 'Click');
		}
		const container = document.createElement('div');
		render(createVNode(Counter, null), container);
		const button = container.querySelector('button')!;
		button.setAttribute('data-exact-id', 'server-label');
		expect(
			applyPatches(container, [
				{ type: 'prop', id: 'server-label', name: 'title', value: 'patched' }
			])
		).toBe(true);
		button.click();
		expect(clicks).toBe(1);
	});

	it('parses replacement patches in the target SVG namespace', () => {
		const container = document.createElement('div');
		container.innerHTML = '<svg><!--exact:shape--><rect></rect><!--/exact:shape--></svg>';
		expect(
			applyPatches(container, [{ type: 'replace', id: 'shape', html: '<circle></circle>' }])
		).toBe(true);
		expect(container.querySelector('circle')?.namespaceURI).toBe('http://www.w3.org/2000/svg');
	});

	it('restores same-signature form controls by compiler identity after repair reorders them', () => {
		const container = document.createElement('div');
		document.body.appendChild(container);
		container.innerHTML =
			'<!--exact:fragment:0--><input data-exact-id=a name=title value=A><input data-exact-id=b name=title value=B><!--/exact:fragment:0-->';
		try {
			const edited = container.querySelector('[data-exact-id=b]') as HTMLInputElement;
			edited.value = 'typed B';
			edited.focus();
			hydrate(
				createVNode(
					Fragment,
					null,
					createVNode('input', { 'data-exact-id': 'b', name: 'title', value: 'B' }),
					createVNode('input', { 'data-exact-id': 'a', name: 'title', value: 'A' })
				),
				container,
				{ logger: noopLogger }
			);
			const restored = container.querySelector('[data-exact-id=b]') as HTMLInputElement;
			expect(restored.value).toBe('typed B');
			expect(document.activeElement).toBe(restored);
		} finally {
			container.remove();
		}
	});

	it('aborts in-flight operations when the hydration client is disposed', async () => {
		const container = document.createElement('div');
		container.innerHTML = '<!--exact:title-->Old<!--/exact:title-->';
		let requestSignal: AbortSignal | undefined;
		const client = createExactClient(container, {
			endpoint: '/__exact',
			batch: false,
			continuations: { save: testContinuation('save') },
			fetch: async (_input, init) => {
				requestSignal = init.signal;
				return await new Promise<never>(() => undefined);
			}
		});
		const operation = client.invokeAction('save');
		await Promise.resolve();
		client.dispose();

		expect(requestSignal?.aborted).toBe(true);
		await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
		expect(container.textContent).toBe('Old');
	});

	it('does not duplicate marker-bearing SSR markup while creating the client tree', () => {
		const root = document.createElement('div');
		root.innerHTML = '<!--exact:component:0--><p>server</p><!--/exact:component:0-->';
		hydrate(createVNode('p', null, 'client'), root, { logger: noopLogger });
		expect(root.querySelectorAll('p')).toHaveLength(1);
		expect(root.textContent).toBe('client');
	});

	it('reads endpoint and state from the hydration bootstrap script', () => {
		const root = document.createElement('main');
		root.innerHTML =
			'<script type="application/json" id="__exact_hydration">{"endpoint":"/__exact","endpoints":{"actions":{"save-remote":"https://remote.test/__exact"},"boundaries":{"remote-panel":"https://remote.test/__exact"}},"state":{"ready":true},"continuations":{"save":{"id":"save","componentId":"test:save","stateReads":[{"path":"project.id","kind":"read","confidence":"exact"}],"stateWrites":[],"publicContexts":[],"serverContexts":[],"boundaries":["profile","slot:children"]}}}</script>';

		expect(readExactHydrationConfig(root)).toEqual({
			endpoint: '/__exact',
			endpoints: {
				actions: {
					'save-remote': 'https://remote.test/__exact'
				},
				boundaries: {
					'remote-panel': 'https://remote.test/__exact'
				}
			},
			state: { ready: true },
			continuations: {
				save: {
					id: 'save',
					componentId: 'test:save',
					stateReads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }],
					stateWrites: [],
					publicContexts: [],
					serverContexts: [],
					boundaries: ['profile', 'slot:children']
				}
			}
		});
	});

	it('creates clients from hydration bootstrap data by default', async () => {
		document.body.innerHTML =
			'<script type="application/json" id="__exact_hydration">{"endpoint":"/__exact","state":{"project":{"id":"p1","secret":"hidden"}},"continuations":{"save":{"id":"save","componentId":"test:save","stateReads":[{"path":"project.id","kind":"read","confidence":"exact"}],"stateWrites":[],"publicContexts":[],"serverContexts":[],"boundaries":[]}}}</script>';
		const container = document.createElement('main');
		document.body.appendChild(container);
		let requestBody: any;
		const client = createExactClient(container, {
			fetch: async (input, init) => {
				requestBody = JSON.parse(init.body);
				expect(input).toBe('/__exact');
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

		expect(client.state).toEqual({ project: { id: 'p1', secret: 'hidden' } });
		expect(requestBody.state).toEqual({ project: { id: 'p1' } });
		document.body.innerHTML = '';
	});

	it('falls back to refresh replacement html when fine-grained patches miss', async () => {
		const container = document.createElement('main');
		container.innerHTML = '<!--exact:panel--><p>Old</p><!--/exact:panel-->';
		const fetch = async (_input: string, init: { body: string }) => {
			const response = await handleExactRequest(
				{
					method: 'POST',
					body: JSON.parse(init.body)
				},
				{
					contract: {
						version: 1,
						actions: {},
						boundaries: {
							panel: defineExactBoundaryContract('panel')
						}
					},
					refreshBoundaries: {
						panel: () => ({
							patches: [{ type: 'text', id: 'missing', value: 'No target' }],
							html: '<section>Fallback</section>'
						})
					}
				}
			);
			return {
				ok: response.status >= 200 && response.status < 300,
				status: response.status,
				async json() {
					return JSON.parse(response.body);
				}
			};
		};

		const client = createExactClient(container, {
			endpoint: '/__exact',
			fetch
		});
		await client.refreshBoundary('panel');

		expect(container.innerHTML).toBe(
			'<!--exact:panel--><section>Fallback</section><!--/exact:panel-->'
		);
	});

	it('reports false when patches cannot apply', () => {
		const container = document.createElement('div');

		expect(
			applyPatches(container, [{ type: 'text', id: 'missing', value: 'New' }], {
				logger: noopLogger
			})
		).toBe(false);
	});

	it('invokes exact batch endpoints directly', async () => {
		let requestBody: any;
		const results = await invokeExactBatch({
			endpoint: '/__exact',
			operations: [
				{ type: 'action', id: 'save', payload: { title: 'Ready' } },
				{ type: 'refresh', id: 'panel', boundaryHtml: '<p>Old</p>' }
			],
			fetch: async (_input, init) => {
				requestBody = JSON.parse(init.body);
				return {
					ok: true,
					status: 200,
					async json() {
						return {
							ok: true,
							version: 1,
							results: [
								{
									ok: true,
									type: 'action',
									id: 'save',
									patches: [{ type: 'text', id: 'title', value: 'Ready' }]
								},
								{ ok: false, type: 'refresh', id: 'panel', status: 404, error: 'not_found' }
							]
						};
					}
				};
			}
		});

		expect(requestBody).toEqual({
			type: 'batch',
			version: 1,
			operations: [
				{ type: 'action', id: 'save', payload: { title: 'Ready' } },
				{ type: 'refresh', id: 'panel', boundaryHtml: '<p>Old</p>' }
			]
		});
		expect(results).toHaveLength(2);
		expect(results[0]).toMatchObject({ ok: true, id: 'save' });
		expect(results[1]).toMatchObject({ ok: false, id: 'panel' });
	});

	it('sends compiler-approved public context through direct endpoint invocations', async () => {
		let requestBody: unknown;
		const result = await invokeExact({
			endpoint: '/__exact',
			type: 'action',
			id: 'save',
			publicContext: {
				AuthContext: { id: 'u1' }
			},
			fetch: async (_input, init) => {
				requestBody = JSON.parse(init.body);
				return {
					ok: true,
					status: 200,
					async json() {
						return {
							ok: true,
							type: 'action',
							id: 'save',
							state: { saved: true }
						};
					}
				};
			}
		});

		expect(requestBody).toEqual({
			type: 'action',
			id: 'save',
			publicContext: {
				AuthContext: { id: 'u1' }
			}
		});
		expect(result).toEqual({ state: { saved: true } });
	});

	it('normalizes successful exact invocation responses', async () => {
		const result = await invokeExact({
			endpoint: '/__exact',
			type: 'action',
			id: 'save',
			fetch: async () => ({
				ok: true,
				status: 200,
				async json() {
					return {
						ok: true,
						type: 'action',
						id: 'save',
						state: { saved: true },
						patches: [{ type: 'text', id: 'title', value: 'Saved' }]
					};
				}
			})
		});

		expect(result).toEqual({
			state: { saved: true },
			patches: [{ type: 'text', id: 'title', value: 'Saved' }]
		});
		expect('ok' in result).toBe(false);
	});

	it('rejects failed endpoint invocations', async () => {
		await expect(
			invokeExact({
				endpoint: '/__exact',
				type: 'refresh',
				id: 'panel',
				logger: noopLogger,
				fetch: async () => ({
					ok: false,
					status: 404,
					async json() {
						return { error: 'not_found' };
					}
				})
			})
		).rejects.toThrow('eXact refresh invocation failed');
	});
});
