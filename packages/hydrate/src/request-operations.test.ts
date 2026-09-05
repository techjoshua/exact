/* eslint-disable @typescript-eslint/no-explicit-any -- This test intentionally models external, private, or invalid values that production contracts reject. */
/**
 * @vitest-environment jsdom
 */
import { render } from '@exactjs/dom';
import { renderToHydratableString } from '@exactjs/ssr';
import { defineExactBoundaryContract, handleExactRequest, unsafeExactHtml } from '@exactjs/server';
import { describe, expect, it } from 'vitest';
import { createExactClient, hydrate, readExactHydrationConfig } from './index.js';
import { invokeExact, invokeExactBatch } from './invocations.js';
import { applyPatches } from './patches.js';
import {
	readRequestClicks,
	reorderedControlsRoot,
	requestClickCounterRoot,
	resetRequestClicks,
	requestParagraphRoot
} from './test-support/request-operations.fixtures.js';
import {
	reorderedControlsRoot as serverReorderedControlsRoot,
	requestParagraphRoot as serverRequestParagraphRoot
} from './test-support/request-operations.fixtures.js?exact-target=server';
import { noopLogger, testContinuation } from './test-support/responses.js';

describe('@exactjs/hydrate request-operations', () => {
	it('encodes request Maps and Sets and decodes them in responses', async () => {
		let requestBody: any;
		const result = await invokeExact({
			endpoint: '/__exact',
			type: 'invoke',
			id: 'collections',
			payload: {
				lookup: new Map([['answer', 42]]),
				selected: new Set(['answer'])
			},
			fetch: async (_input, init) => {
				requestBody = JSON.parse(init.body);
				return {
					ok: true,
					status: 200,
					async json() {
						return {
							ok: true,
							type: 'invoke',
							id: 'collections',
							state: {
								lookup: { $exact: 'map', version: 1, entries: [['answer', 42]] },
								selected: { $exact: 'set', version: 1, values: ['answer'] }
							}
						};
					}
				};
			}
		});

		expect(requestBody.payload.lookup).toEqual({
			$exact: 'map',
			version: 1,
			entries: [['answer', 42]]
		});
		expect(requestBody.payload.selected).toEqual({
			$exact: 'set',
			version: 1,
			values: ['answer']
		});
		expect((result.state as any).lookup).toEqual(new Map([['answer', 42]]));
		expect((result.state as any).selected).toEqual(new Set(['answer']));
	});

	it('keeps unrelated client ownership active after a server prop patch', () => {
		resetRequestClicks();
		const container = document.createElement('div');
		render(requestClickCounterRoot, container);
		const button = container.querySelector('button')!;
		button.setAttribute('data-exact-id', 'server-label');
		expect(
			applyPatches(container, [
				{ type: 'prop', id: 'server-label', name: 'title', value: 'patched' }
			])
		).toBe(true);
		button.click();
		expect(readRequestClicks()).toBe(1);
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
		const rendered = renderToHydratableString(serverReorderedControlsRoot(false));
		container.innerHTML = rendered.html;
		try {
			const edited = container.querySelector('[data-exact-id=b]') as HTMLInputElement;
			edited.value = 'typed B';
			edited.focus();
			hydrate(reorderedControlsRoot(true), container, {
				logger: noopLogger,
				resumptions: rendered.resumptions
			});
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
		const operation = client.invokeTask('save');
		await Promise.resolve();
		client.dispose();

		expect(requestSignal?.aborted).toBe(true);
		await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
		expect(container.textContent).toBe('Old');
	});

	it('does not duplicate marker-bearing SSR markup while creating the client tree', () => {
		const root = document.createElement('div');
		const rendered = renderToHydratableString(serverRequestParagraphRoot('server'));
		root.innerHTML = rendered.html;
		hydrate(requestParagraphRoot('client'), root, {
			logger: noopLogger,
			resumptions: rendered.resumptions
		});
		expect(root.querySelectorAll('p')).toHaveLength(1);
		expect(root.textContent).toBe('client');
	});

	it('reads endpoint and state from the hydration bootstrap script', () => {
		const root = document.createElement('main');
		root.innerHTML =
			'<script type="application/json" id="__exact_hydration">{"endpoint":"/__exact","endpoints":{"invocations":{"save-remote":"https://remote.test/__exact"},"boundaries":{"remote-panel":"https://remote.test/__exact"}},"state":{"ready":true},"continuations":{"save":{"id":"save","componentId":"test:save","kind":"task","readiness":"nonblocking","dependencies":[],"stateReads":[{"path":"project.id","kind":"read","confidence":"exact"}],"stateWrites":[],"publicContexts":[],"serverContexts":[],"contextWrites":[],"boundaries":["profile","slot:children"]}}}</script>';

		expect(readExactHydrationConfig(root)).toEqual({
			endpoint: '/__exact',
			endpoints: {
				invocations: {
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
					kind: 'task',
					readiness: 'nonblocking',
					dependencies: [],
					stateReads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }],
					stateWrites: [],
					publicContexts: [],
					serverContexts: [],
					contextWrites: [],
					boundaries: ['profile', 'slot:children']
				}
			}
		});
	});

	it('creates clients from hydration bootstrap data by default', async () => {
		document.body.innerHTML =
			'<script type="application/json" id="__exact_hydration">{"endpoint":"/__exact","state":{"project":{"id":"p1","secret":"hidden"}},"continuations":{"save":{"id":"save","componentId":"test:save","kind":"task","readiness":"nonblocking","dependencies":[],"stateReads":[{"path":"project.id","kind":"read","confidence":"exact"}],"stateWrites":[],"publicContexts":[],"serverContexts":[],"contextWrites":[],"boundaries":[]}}}</script>';
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
						return { ok: true, type: 'invoke', id: 'save' };
					}
				};
			}
		});

		await client.invokeTask('save');

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
						invocations: {},
						boundaries: {
							panel: defineExactBoundaryContract('panel')
						}
					},
					refreshBoundaries: {
						panel: () => ({
							patches: [{ type: 'text', id: 'missing', value: 'No target' }],
							html: unsafeExactHtml('<section>Fallback</section>')
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
				{ type: 'invoke', id: 'save', payload: { title: 'Ready' } },
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
									type: 'invoke',
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
				{ type: 'invoke', id: 'save', payload: { title: 'Ready' } },
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
			type: 'invoke',
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
							type: 'invoke',
							id: 'save',
							state: { saved: true }
						};
					}
				};
			}
		});

		expect(requestBody).toEqual({
			type: 'invoke',
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
			type: 'invoke',
			id: 'save',
			fetch: async () => ({
				ok: true,
				status: 200,
				async json() {
					return {
						ok: true,
						type: 'invoke',
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
