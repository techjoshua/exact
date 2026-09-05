import { createKeyedServerSlot, createServerBoundary } from '@exactjs/core/runtime/render';
import { createOperation } from './test-support/native-operations.js';
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
import { StateDerivedBoundaryHost } from './boundaries.fixtures.test.js';

describe('@exactjs/ssr boundaries', () => {
	it('passes request cancellation into boundary render callbacks', async () => {
		const abort = new AbortController();
		let observed: AbortSignal | undefined;
		const handler = createBoundaryRefreshHandler(
			(_input, context) => {
				observed = context.signal;
				return createOperation('p', null, 'ready');
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
				__exactHydrationFallback: createOperation(
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
				createOperation('p', null, 'Server child')
			)
		);

		expect(result.html).toContain('data-exact-client-boundary="island-children"');
		expect(result.html).toContain('data-exact-server-slot="island-children:children"');
		expect(result.html).toContain('<p>Server child</p>');
		expect(result.html).toContain(
			'&quot;__exactServerSlot&quot;:&quot;island-children:children&quot;'
		);
	});

	it('renders independently adoptable partition slots for client-boundary children', async () => {
		const boundary = createServerBoundary(
			'island-partitioned',
			'Shell_ExactClient_1',
			{ __exactServerSlots: ['summary-edge', 'permissions-edge'] },
			createOperation('p', null, 'Summary'),
			createOperation('p', null, 'Permissions')
		);
		for (const html of [
			renderToString(boundary).html,
			(await renderToStringAsync(boundary)).html
		]) {
			expect(html).toContain('data-exact-server-slot="summary-edge"');
			expect(html).toContain('data-exact-server-slot="permissions-edge"');
			expect(html).toContain(
				'&quot;children&quot;:[{&quot;__exactServerSlot&quot;:&quot;summary-edge&quot;},{&quot;__exactServerSlot&quot;:&quot;permissions-edge&quot;}]'
			);
			expect(html).not.toContain('__exactServerSlots');
		}
	});

	it('emits the complete partition authority tuple for compiler-planned ranges', () => {
		const reference = {
			__exactServerSlot: 'summary-edge',
			planVersion: 1,
			buildKey: 'build-1',
			planEdgeId: 'summary-edge',
			ownerComponentId: 'workspace-component',
			discriminator: { kind: 'single' as const },
			generation: 1
		};
		const html = renderToString(
			createServerBoundary(
				'island-partitioned',
				'Shell_ExactClient_1',
				{ __exactServerSlots: [reference] },
				createOperation('p', null, 'Summary')
			),
			{ buildKey: 'build-1', executionRoot: 'page' }
		).html;
		expect(html).toContain('data-exact-partition-build="build-1"');
		expect(html).toContain('data-exact-partition-root="page"');
		expect(html).toContain('data-exact-partition-edge="summary-edge"');
		expect(html).toContain('data-exact-partition-owner="workspace-component"');
		expect(html).toContain('&quot;generation&quot;:1');
	});

	it('emits opaque branch and keyed instance discriminators', () => {
		const slot = (
			id: string,
			discriminator:
				| { kind: 'branch'; branch: string }
				| { kind: 'keyed'; list: string; keyToken: string }
		) => ({
			__exactServerSlot: id,
			planVersion: 1,
			buildKey: 'build-1',
			planEdgeId: id,
			ownerComponentId: 'workspace-component',
			discriminator,
			generation: 2
		});
		const html = renderToString(
			createServerBoundary(
				'island-structured',
				'Shell_ExactClient_1',
				{
					__exactServerSlots: [
						slot('remote-branch', { kind: 'branch', branch: 'remote-branch' }),
						slot('row-edge', { kind: 'keyed', list: 'rows-template', keyToken: 'row:7' })
					]
				},
				createOperation('p', null, 'Remote'),
				createOperation('p', null, 'Row')
			),
			{ buildKey: 'build-1', executionRoot: 'page' }
		).html;

		expect(html).toContain('data-exact-partition-branch="remote-branch"');
		expect(html).toContain('data-exact-partition-list="rows-template"');
		expect(html).toContain('data-exact-partition-key="row:7"');
	});

	it('renders standalone keyed ranges emitted inside structural callbacks', () => {
		const html = renderToString(
			createKeyedServerSlot(
				'row-edge',
				'rows-template',
				7,
				{
					planVersion: 1,
					buildKey: 'build-1',
					planEdgeId: 'row-edge',
					ownerComponentId: 'rows-component',
					generation: 2
				},
				createOperation('p', null, 'Row seven')
			),
			{ buildKey: 'build-1', executionRoot: 'page' }
		).html;

		expect(html).toContain('data-exact-server-slot="row-edge:key:7"');
		expect(html).toContain('data-exact-partition-list="rows-template"');
		expect(html).toContain('data-exact-partition-key="7"');
		expect(html).toContain('<p>Row seven</p>');
	});

	it('rejects malformed partition slot metadata before publishing markup', () => {
		expect(() =>
			renderToString(
				createServerBoundary(
					'island-partitioned',
					'Shell_ExactClient_1',
					{ __exactServerSlots: ['duplicate', 'duplicate'] },
					createOperation('p', null, 'Summary'),
					createOperation('p', null, 'Permissions')
				)
			)
		).toThrow('partition slots must uniquely identify every server child');
	});

	it('serializes state-derived client boundary props at render time', () => {
		const result = renderToString(createOperation(StateDerivedBoundaryHost, {}));

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
							return createOperation('p', null, name);
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
								render: () => createOperation('p', { className: 'saved' }, 'Saved')
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
					profile: createBoundaryRefreshHandler(() => 'Ada & Lin', {
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
						() => createOperation('p', { className: 'new', title: 'Ada' }, 'Ready'),
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
						() => createOperation('p', { className: 'new' }, 'Ready'),
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
				['<!--i:a--><li>A</li><!--/i:a-->', '<!--i:b--><li>B</li><!--/i:b-->'].join('')
			)
		).toMatchObject({
			listId: 'tasks',
			innerHtml: '<!--i:a--><li>A</li><!--/i:a--><!--i:b--><li>B</li><!--/i:b-->',
			items: [
				{ key: 'a', html: '<!--i:a--><li>A</li><!--/i:a-->' },
				{ key: 'b', html: '<!--i:b--><li>B</li><!--/i:b-->' }
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
					boundaryHtml: ['<!--i:a--><li>A</li><!--/i:a-->', '<!--i:b--><li>B</li><!--/i:b-->'].join(
						''
					)
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
						render: (item) => createOperation('li', null, item.label)
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
					html: '<!--i:c--><li>C</li><!--/i:c-->'
				}
			]
		});
	});
});
