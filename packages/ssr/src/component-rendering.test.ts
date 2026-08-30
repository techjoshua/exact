import { defineExactBoundaryContract, defineExactOperationContract } from '@exactjs/server';
import { describe, expect, it } from 'vitest';
import {
	createExactServerHandlerRegistry,
	diffBoundaryHtml,
	renderToString,
	renderToStringAsync
} from './index.js';
import { createOperation } from './test-support/native-operations.js';
import {
	ObservedServerComponent,
	ParallelSettledSiblings,
	ParentWithSettledChild,
	ProfileComponent,
	readComponentRenderingFixtureState,
	readParallelTaskStarts,
	resetComponentRenderingFixtureState,
	ServerCard,
	settleParallelTasks,
	SynchronousObservedServerComponent
} from './component-rendering.fixtures.test.js';

describe('@exactjs/ssr component and server contracts', () => {
	it('renders component output without marking components as mounted', () => {
		resetComponentRenderingFixtureState();
		const result = renderToString(createOperation(ServerCard, { title: 'Server' }));

		expect(result.html).toContain('<article>Server</article>');
		expect(result.html).toContain('<!--exact:component:');
		expect(readComponentRenderingFixtureState().cardMounts).toBe(0);
	});

	it('observes settled sync and async components before renderer disposal', async () => {
		const observed: number[] = [];
		resetComponentRenderingFixtureState();
		renderToString(createOperation(SynchronousObservedServerComponent, {}), {
			onDirectComponentRendered: (snapshot) => {
				observed.push(snapshot.state.value as number);
				expect(readComponentRenderingFixtureState().observedDisposals).toBe(0);
			}
		});
		expect(observed).toEqual([1]);
		expect(readComponentRenderingFixtureState().observedDisposals).toBe(1);

		observed.length = 0;
		resetComponentRenderingFixtureState();
		await renderToStringAsync(createOperation(ObservedServerComponent, {}), {
			onDirectComponentRendered: (snapshot) => {
				observed.push(snapshot.state.value as number);
				expect(readComponentRenderingFixtureState().observedDisposals).toBe(0);
			}
		});
		expect(observed).toEqual([2]);
		expect(readComponentRenderingFixtureState().observedDisposals).toBe(1);
	});

	it('counts empty primitive child slots against the SSR breadth budget', () => {
		const vnode = createOperation('div', null, ...Array.from({ length: 20 }, () => null));
		expect(() => renderToString(vnode, { markers: false, maxTreeNodes: 8 })).toThrow(
			'eXact SSR tree exceeds the configured maximum of 8 render values'
		);
	});

	it('waits for async tasks before rendering a component in async mode', async () => {
		const result = await renderToStringAsync(createOperation(ProfileComponent, {}), {
			markers: false
		});

		expect(result.html).toBe('<p>Ada</p>');
	});

	it('renders child components after their async tasks settle', async () => {
		const result = await renderToStringAsync(createOperation(ParentWithSettledChild, {}), {
			markers: false
		});

		expect(result.html).toBe('<section><strong>Ready</strong></section>');
	});

	it('issues scheduled sibling tasks before serializing their ordered output', async () => {
		resetComponentRenderingFixtureState();
		const rendering = renderToStringAsync(createOperation(ParallelSettledSiblings, {}), {
			markers: false
		});
		for (let turn = 0; turn < 10; turn++) await Promise.resolve();
		const startsBeforeRelease = readParallelTaskStarts();
		settleParallelTasks();
		expect(startsBeforeRelease).toBe(3);
		await expect(rendering).resolves.toMatchObject({
			html: '<section><strong>Ready 1</strong><strong>Ready 2</strong><strong>Ready 3</strong></section>'
		});
	});

	it('creates contract-scoped server handler registries', async () => {
		const registry = createExactServerHandlerRegistry({
			contract: {
				version: 1,
				invocations: {
					'save-profile': defineExactOperationContract('save-profile', {
						componentId: 'Profile',
						writes: [{ path: 'saved', kind: 'write', confidence: 'exact' }],
						boundaries: ['profile']
					})
				},
				executors: {},
				boundaries: {
					profile: defineExactBoundaryContract('profile', {
						componentId: 'Profile',
						ownerComponentId: 'Profile'
					}),
					private: defineExactBoundaryContract('private', {
						componentId: 'Private',
						ownerComponentId: 'Private'
					})
				}
			},
			markers: false,
			patchStrategy: 'element',
			invocations: {
				'save-profile': () => ({ state: { saved: true } }),
				'private-action': () => ({
					patches: [{ type: 'replace', id: 'private', html: '<p>nope</p>' }]
				})
			},
			boundaries: {
				profile: () => createOperation('p', { className: 'saved' }, 'Saved'),
				private: () => createOperation('p', null, 'Private')
			}
		});

		const refresh = await registry.refreshBoundaries.profile(
			{
				type: 'refresh',
				id: 'profile',
				boundaryHtml: '<p class="old">Loading</p>'
			},
			{ contract: { version: 1, invocations: {}, executors: {}, boundaries: {} } }
		);
		const action = await registry.invocations['save-profile'](
			{
				type: 'invoke',
				id: 'save-profile',
				boundaryHtmls: {
					profile: '<p class="old">Loading</p>',
					private: '<p>Private</p>'
				}
			},
			{ contract: { version: 1, invocations: {}, executors: {}, boundaries: {} } }
		);

		expect(Object.keys(registry.invocations)).toEqual(['save-profile']);
		expect(Object.keys(registry.refreshBoundaries)).toEqual(['private', 'profile']);
		expect(refresh.patches).toEqual([
			{ type: 'prop', id: 'profile', name: 'class', value: 'saved' },
			{ type: 'text', id: 'profile', value: 'Saved' }
		]);
		expect(action).toMatchObject({
			state: { saved: true },
			patches: [
				{ type: 'prop', id: 'profile', name: 'class', value: 'saved' },
				{ type: 'text', id: 'profile', value: 'Saved' }
			]
		});
	});

	it('installs compiler-generated continuation executors and refreshes their boundaries', async () => {
		const action = defineExactOperationContract('load-profile', {
			componentId: 'Profile',
			reads: [{ path: 'id', kind: 'read', confidence: 'exact' }],
			writes: [{ path: 'name', kind: 'write', confidence: 'exact' }],
			boundaries: ['profile']
		});
		const registry = createExactServerHandlerRegistry({
			contract: {
				version: 1,
				invocations: { [action.id]: action },
				executors: {
					[action.id]: {
						id: action.id,
						componentId: action.componentId,
						execute(activation) {
							activation.state.name = 'Generated';
							return { state: activation.state };
						}
					}
				},
				boundaries: {
					profile: defineExactBoundaryContract('profile', {
						componentId: 'Profile',
						ownerComponentId: 'Profile'
					})
				}
			},
			markers: false,
			boundaries: {
				profile: () => createOperation('p', null, 'Generated')
			}
		});

		const result = await registry.invocations[action.id](
			{
				type: 'invoke',
				id: action.id,
				payload: { dependencies: [] },
				state: { id: 'p1' },
				boundaryHtmls: { profile: '<p>Loading</p>' }
			},
			{ contract: { version: 1, invocations: {}, executors: {}, boundaries: {} } }
		);

		expect(result).toMatchObject({
			state: { name: 'Generated' },
			patches: [{ type: 'replace', id: 'profile', html: '<p>Generated</p>' }]
		});
	});

	it('replaces multiple independent nested exact elements when sibling subtree shapes change', () => {
		expect(
			diffBoundaryHtml(
				'profile',
				'<section data-exact-id="root"><article data-exact-id="card-a"><p data-exact-id="body-a">Draft</p></article><article data-exact-id="card-b"><p data-exact-id="body-b">Queued</p></article></section>',
				'<section data-exact-id="root"><article data-exact-id="card-a"><p data-exact-id="body-a"><strong>Ready</strong></p></article><article data-exact-id="card-b"><p data-exact-id="body-b"><em>Done</em></p></article></section>',
				'element'
			)
		).toEqual([
			{
				type: 'replace',
				id: 'body-a',
				html: '<p data-exact-id="body-a"><strong>Ready</strong></p>'
			},
			{
				type: 'replace',
				id: 'body-b',
				html: '<p data-exact-id="body-b"><em>Done</em></p>'
			}
		]);
	});
});
