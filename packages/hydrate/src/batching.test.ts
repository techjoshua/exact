/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { createExactClient } from './index.js';
import { testContinuation } from './test-support/responses.js';

describe('@exactjs/hydrate batching', () => {
	it('batches compatible operations from different client roots while preserving roots', async () => {
		const left = document.createElement('div');
		const right = document.createElement('div');
		const requests: unknown[] = [];
		const fetch = async (_input: string, init: { body: string }) => {
			const body = JSON.parse(init.body);
			requests.push(body);
			return {
				ok: true,
				status: 200,
				async json() {
					return {
						ok: true,
						version: 1,
						results: body.operations.map((operation: { type: string; id: string }) => ({
							ok: true,
							type: operation.type,
							id: operation.id
						}))
					};
				}
			};
		};
		const shared = {
			endpoint: '/__exact',
			binding: 'billing',
			buildKey: '0123456789abcdef0123456789abcdef01234567',
			continuations: { save: testContinuation('save') },
			fetch
		};
		const leftClient = createExactClient(left, {
			...shared,
			executionRoot: '@company/billing#./Area'
		});
		const rightClient = createExactClient(right, {
			...shared,
			executionRoot: '@company/billing#./Summary'
		});

		await Promise.all([leftClient.invokeAction('save'), rightClient.invokeAction('save')]);
		expect(requests).toEqual([
			{
				type: 'batch',
				version: 1,
				operations: [
					{ type: 'action', root: '@company/billing#./Area', id: 'save' },
					{ type: 'action', root: '@company/billing#./Summary', id: 'save' }
				]
			}
		]);
		leftClient.dispose();
		rightClient.dispose();
	});

	it('coalesces same-tick client operations into a batch request', async () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<!--exact:title-->Old<!--/exact:title--><!--exact:panel--><p>Old</p><!--/exact:panel-->';
		const requests: unknown[] = [];
		const fetch = async (_input: string, init: { body: string }) => {
			requests.push(JSON.parse(init.body));
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
								id: 'save-title',
								state: { saved: true },
								patches: [{ type: 'text', id: 'title', value: 'New' }]
							},
							{
								ok: true,
								type: 'refresh',
								id: 'panel',
								patches: [{ type: 'replace', id: 'panel', html: '<section>Panel</section>' }]
							}
						]
					};
				}
			};
		};

		const client = createExactClient(container, {
			endpoint: '/__exact',
			state: { saved: false },
			continuations: {
				'save-title': testContinuation('save-title', { boundaries: ['title'] })
			},
			fetch
		});
		const action = client.invokeAction('save-title', { title: 'New' });
		const refresh = client.refreshBoundary('panel');

		await Promise.all([action, refresh]);

		expect(requests).toEqual([
			{
				type: 'batch',
				version: 1,
				operations: [
					{
						type: 'action',
						root: 'page',
						id: 'save-title',
						payload: { title: 'New' },
						state: { saved: false },
						boundaryHtmls: { title: 'Old' }
					},
					{
						type: 'refresh',
						root: 'page',
						id: 'panel',
						state: { saved: false },
						boundaryHtml: '<p>Old</p>'
					}
				]
			}
		]);
		expect(container.textContent).toBe('NewPanel');
		expect(client.state).toEqual({ saved: true });
	});

	it('routes same-tick operations into endpoint-specific batches', async () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<!--exact:title-->Old<!--/exact:title--><!--exact:remote-panel--><p>Remote</p><!--/exact:remote-panel-->';
		const requests: { input: string; body: unknown }[] = [];
		const fetch = async (input: string, init: { body: string }) => {
			const body = JSON.parse(init.body);
			requests.push({ input, body });
			return {
				ok: true,
				status: 200,
				async json() {
					const resultFor = (operation: { type: string; id: string }) => ({
						ok: true,
						type: operation.type,
						id: operation.id,
						patches:
							operation.id === 'save-title'
								? [{ type: 'text', id: 'title', value: 'Saved' }]
								: operation.id === 'remote-panel'
									? [{ type: 'replace', id: 'remote-panel', html: '<section>Remote</section>' }]
									: []
					});
					return body.type === 'batch'
						? {
								ok: true,
								version: 1,
								results: body.operations.map(resultFor)
							}
						: {
								ok: true,
								type: body.type,
								id: body.id,
								patches: resultFor(body).patches
							};
				}
			};
		};

		const client = createExactClient(container, {
			endpoint: '/__exact',
			endpoints: {
				actions: {
					'save-remote': 'https://remote.test/__exact'
				},
				boundaries: {
					'remote-panel': 'https://remote.test/__exact'
				}
			},
			continuations: {
				'save-title': testContinuation('save-title', { boundaries: ['title'] }),
				'save-remote': testContinuation('save-remote')
			},
			fetch
		});

		await Promise.all([
			client.invokeAction('save-title'),
			client.refreshBoundary('remote-panel'),
			client.invokeAction('save-remote')
		]);

		expect(requests).toHaveLength(2);
		expect(requests.map((request) => request.input).sort()).toEqual([
			'/__exact',
			'https://remote.test/__exact'
		]);
		expect(requests.find((request) => request.input === '/__exact')?.body).toMatchObject({
			type: 'action',
			id: 'save-title'
		});
		expect(
			requests.find((request) => request.input === 'https://remote.test/__exact')?.body
		).toMatchObject({
			type: 'batch',
			version: 1,
			operations: [
				{
					type: 'refresh',
					id: 'remote-panel',
					boundaryHtml: '<p>Remote</p>'
				},
				{
					type: 'action',
					id: 'save-remote'
				}
			]
		});
		expect(container.textContent).toBe('SavedRemote');
	});

	it('applies successful batched client operations when a sibling operation fails', async () => {
		const container = document.createElement('div');
		container.innerHTML = '<!--exact:title-->Old<!--/exact:title-->';
		const fetch = async () => ({
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
							id: 'save-title',
							patches: [{ type: 'text', id: 'title', value: 'Saved' }]
						},
						{
							ok: false,
							type: 'refresh',
							id: 'missing-panel',
							status: 404,
							error: 'not_found'
						}
					]
				};
			}
		});

		const client = createExactClient(container, {
			endpoint: '/__exact',
			continuations: {
				'save-title': testContinuation('save-title', { boundaries: ['title'] })
			},
			fetch
		});
		const action = client.invokeAction('save-title');
		const refresh = client.refreshBoundary('missing-panel');

		await expect(action).resolves.toMatchObject({
			patches: [{ type: 'text', id: 'title', value: 'Saved' }]
		});
		await expect(refresh).rejects.toThrow('eXact refresh invocation failed');
		expect(container.textContent).toBe('Saved');
	});
});
