import { createServerBoundary, createTextVNode, type Component } from '@exactjs/core';
import { createVNode } from './test-support/native-vnode.js';
import {
	defineExactOperationContract,
	defineExactBoundaryContract,
	handleExactRequest
} from '@exactjs/server';
import { describe, expect, it } from 'vitest';
import {
	createInvocationRefreshHandler,
	createBoundaryRefreshHandler,
	createKeyedListRefreshHandler,
	diffBoundaryHtml,
	parseKeyedListSnapshotHtml,
	renderToString,
	renderToStringAsync
} from './index.js';

describe('@exactjs/ssr boundaries', () => {
	it('passes request cancellation into boundary render callbacks', async () => {
		const abort = new AbortController();
		let observed: AbortSignal | undefined;
		const handler = createBoundaryRefreshHandler(
			(_input, context) => {
				observed = context.signal;
				return createVNode('p', null, 'ready');
			},
			{ boundaryId: 'panel' }
		);
		await handler(
			{ type: 'refresh', id: 'panel' },
			{
				contract: {
					version: 1,
					invocations: {},
					boundaries: { panel: defineExactBoundaryContract('panel') }
				},
				signal: abort.signal
			}
		);
		expect(observed).toBe(abort.signal);
	});

	it('renders server client-boundary placeholders', () => {
		const result = renderToString(
			createServerBoundary('island-1', 'Panel_ExactClient_1', {
				title: '</script>'
			})
		);

		expect(result.html).toContain('exact:client-boundary');
		expect(result.html).toContain('data-exact-client-boundary="island-1"');
		expect(result.html).toContain('data-exact-client-name="Panel_ExactClient_1"');
		expect(result.html).toContain('\\u003C/script&gt;');
		expect(result.html).not.toContain('</script>');
	});

	it('renders adoptable interaction fallbacks without serializing compiler metadata', () => {
		const result = renderToString(
			createServerBoundary('interaction-1', 'Counter', {
				count: 2,
				__exactHydration: 'interaction',
				__exactHydrationFallback: createVNode(
					'button',
					{ 'data-exact-id': 'counter-button' },
					'Count 2'
				)
			})
		);

		expect(result.html).toContain('data-exact-client-hydration="interaction"');
		expect(result.html).toContain('data-exact-client-generation="1"');
		expect(result.html).toContain('<button data-exact-id="counter-button">Count 2</button>');
		expect(result.html).toContain('&quot;count&quot;:2');
		expect(result.html).not.toContain('__exactHydration');
	});

	it('renders server children inside client-boundary slots', () => {
		const result = renderToString(
			createServerBoundary(
				'island-children',
				'Shell_ExactClient_1',
				{},
				createVNode('p', null, 'Server child')
			)
		);

		expect(result.html).toContain('data-exact-client-boundary="island-children"');
		expect(result.html).toContain('data-exact-server-slot="island-children:children"');
		expect(result.html).toContain('<p>Server child</p>');
		expect(result.html).toContain(
			'&quot;__exactServerSlot&quot;:&quot;island-children:children&quot;'
		);
	});

	it('serializes state-derived client boundary props at render time', () => {
		function Host(this: Component<{ title: string }>) {
			this.state.title = 'Ready';
			return () =>
				createServerBoundary('island-2', 'Panel_ExactClient_1', {
					title: this.state.title
				});
		}

		const result = renderToString(createVNode(Host, {}));

		expect(result.html).toContain('&quot;title&quot;:&quot;Ready&quot;');
	});

	it('rejects non-serializable client boundary props', () => {
		expect(() =>
			renderToString(
				createServerBoundary('bad', 'Bad_ExactClient_1', {
					onSave() {}
				})
			)
		).toThrow(
			'Client boundary Bad_ExactClient_1 (bad) props must be JSON-serializable; non-serializable value at $.onSave'
		);

		expect(() =>
			renderToString(
				createServerBoundary('bad', 'Bad_ExactClient_1', {
					meta: { values: [1, Number.NaN] }
				})
			)
		).toThrow('non-serializable value at $.meta.values[1]');
	});

	it('identifies generated client boundary payload buckets in serialization errors', () => {
		expect(() =>
			renderToString(
				createServerBoundary('island-1', 'Panel_ExactClient_1', {
					__exactState: {
						project: {
							save() {}
						}
					}
				})
			)
		).toThrow(
			'non-serializable value at $.__exactState.project.save in generated __exactState payload'
		);
	});

	it('identifies generated client boundary payload buckets in async serialization errors', async () => {
		await expect(
			renderToStringAsync(
				createServerBoundary('island-1', 'Panel_ExactClient_1', {
					__exactCapture: {
						formatter: new Date()
					}
				})
			)
		).rejects.toThrow(
			'non-serializable value at $.__exactCapture.formatter in generated __exactCapture payload'
		);
	});

	it('creates server boundary refresh handlers that return replacement patches', async () => {
		const response = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'refresh', id: 'profile', payload: { name: 'Ada' } }
			},
			{
				contract: {
					version: 1,
					invocations: {},
					boundaries: {
						profile: defineExactBoundaryContract('profile')
					}
				},
				refreshBoundaries: {
					profile: createBoundaryRefreshHandler(
						(input) => {
							const name = (input.payload as { name: string }).name;
							return createVNode('p', null, name);
						},
						{
							boundaryId: 'profile',
							markers: false,
							state: { refreshed: true }
						}
					)
				}
			}
		);

		expect(response.status).toBe(200);
		expect(JSON.parse(response.body)).toMatchObject({
			ok: true,
			state: { refreshed: true },
			html: '<p>Ada</p>',
			patches: [{ type: 'replace', id: 'profile', html: '<p>Ada</p>' }]
		});
	});

	it('creates action handlers that rerender configured server boundaries', async () => {
		const response = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'invoke',
					id: 'save-profile',
					boundaryHtmls: {
						profile: '<p class="old">Loading</p>'
					}
				}
			},
			{
				contract: {
					version: 1,
					invocations: {
						'save-profile': defineExactOperationContract('save-profile', {
							writes: [{ path: 'saved', kind: 'write', confidence: 'exact' }],
							boundaries: ['profile']
						})
					},
					executors: {},
					boundaries: {
						profile: defineExactBoundaryContract('profile')
					}
				},
				invocations: {
					'save-profile': createInvocationRefreshHandler({
						invoke: () => ({ state: { saved: true } }),
						boundaries: [
							{
								boundaryId: 'profile',
								markers: false,
								patchStrategy: 'element',
								render: () => createVNode('p', { className: 'saved' }, 'Saved')
							}
						]
					})
				}
			}
		);

		expect(response.status).toBe(200);
		expect(JSON.parse(response.body)).toMatchObject({
			ok: true,
			state: { saved: true },
			patches: [
				{ type: 'prop', id: 'profile', name: 'class', value: 'saved' },
				{ type: 'text', id: 'profile', value: 'Saved' }
			]
		});
	});

	it('can create text patches for text-only boundary refreshes', async () => {
		const response = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'refresh', id: 'profile' }
			},
			{
				contract: {
					version: 1,
					invocations: {},
					boundaries: { profile: defineExactBoundaryContract('profile') }
				},
				refreshBoundaries: {
					profile: createBoundaryRefreshHandler(() => createTextVNode('Ada & Lin'), {
						boundaryId: 'profile',
						markers: false,
						patchStrategy: 'text'
					})
				}
			}
		);

		expect(JSON.parse(response.body)).toMatchObject({
			ok: true,
			patches: [{ type: 'text', id: 'profile', value: 'Ada & Lin' }]
		});
	});

	it('can create prop and text patches for simple element boundary refreshes', async () => {
		const response = await handleExactRequest(
			{
				method: 'POST',
				body: { type: 'refresh', id: 'profile' }
			},
			{
				contract: {
					version: 1,
					invocations: {},
					boundaries: { profile: defineExactBoundaryContract('profile') }
				},
				refreshBoundaries: {
					profile: createBoundaryRefreshHandler(
						() => createVNode('p', { className: 'new', title: 'Ada' }, 'Ready'),
						{
							boundaryId: 'profile',
							markers: false,
							patchStrategy: 'element',
							previousHtml: () => '<p class="old" hidden="true">Loading</p>'
						}
					)
				}
			}
		);

		expect(JSON.parse(response.body)).toMatchObject({
			ok: true,
			patches: [
				{ type: 'prop', id: 'profile', name: 'class', value: 'new' },
				{ type: 'prop', id: 'profile', name: 'title', value: 'Ada' },
				{ type: 'prop', id: 'profile', name: 'hidden', value: null },
				{ type: 'text', id: 'profile', value: 'Ready' }
			]
		});
	});

	it('uses request boundary html as the default previous html for element patches', async () => {
		const response = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'refresh',
					id: 'profile',
					boundaryHtml: '<p class="old">Loading</p>'
				}
			},
			{
				contract: {
					version: 1,
					invocations: {},
					boundaries: { profile: defineExactBoundaryContract('profile') }
				},
				refreshBoundaries: {
					profile: createBoundaryRefreshHandler(
						() => createVNode('p', { className: 'new' }, 'Ready'),
						{
							boundaryId: 'profile',
							markers: false,
							patchStrategy: 'element'
						}
					)
				}
			}
		);

		expect(JSON.parse(response.body)).toMatchObject({
			ok: true,
			patches: [
				{ type: 'prop', id: 'profile', name: 'class', value: 'new' },
				{ type: 'text', id: 'profile', value: 'Ready' }
			]
		});
	});

	it('falls back safely when boundary HTML exceeds the fine-grained diff depth budget', () => {
		const open = '<div>'.repeat(300);
		const close = '</div>'.repeat(300);
		const previous = `<section data-exact-id="root">${open}old${close}</section>`;
		const next = `<section data-exact-id="root">${open}new${close}</section>`;

		expect(diffBoundaryHtml('profile', previous, next, 'element')).toEqual([
			{ type: 'replace', id: 'profile', html: next }
		]);
	});

	it('parses keyed list snapshots from submitted boundary html', () => {
		expect(
			parseKeyedListSnapshotHtml(
				'tasks',
				[
					'<!--exact:item:a--><li>A</li><!--/exact:item:a-->',
					'<!--exact:item:b--><li>B</li><!--/exact:item:b-->'
				].join('')
			)
		).toMatchObject({
			listId: 'tasks',
			innerHtml:
				'<!--exact:item:a--><li>A</li><!--/exact:item:a--><!--exact:item:b--><li>B</li><!--/exact:item:b-->',
			items: [
				{ key: 'a', html: '<!--exact:item:a--><li>A</li><!--/exact:item:a-->' },
				{ key: 'b', html: '<!--exact:item:b--><li>B</li><!--/exact:item:b-->' }
			]
		});
	});

	it('creates keyed list refresh handlers that infer previous snapshots from boundary html', async () => {
		const response = await handleExactRequest(
			{
				method: 'POST',
				body: {
					type: 'refresh',
					id: 'tasks',
					boundaryHtml: [
						'<!--exact:item:a--><li>A</li><!--/exact:item:a-->',
						'<!--exact:item:b--><li>B</li><!--/exact:item:b-->'
					].join('')
				}
			},
			{
				contract: {
					version: 1,
					invocations: {},
					boundaries: { tasks: defineExactBoundaryContract('tasks') }
				},
				refreshBoundaries: {
					tasks: createKeyedListRefreshHandler({
						listId: 'tasks',
						items: () => [
							{ id: 'b', label: 'B' },
							{ id: 'c', label: 'C' }
						],
						key: (item) => item.id,
						render: (item) => createVNode('li', null, item.label)
					})
				}
			}
		);

		expect(JSON.parse(response.body)).toMatchObject({
			ok: true,
			patches: [
				{ type: 'list', id: 'tasks', op: 'remove', key: 'a' },
				{
					type: 'list',
					id: 'tasks',
					op: 'insert',
					key: 'c',
					html: '<!--exact:item:c--><li>C</li><!--/exact:item:c-->'
				}
			]
		});
	});
});
