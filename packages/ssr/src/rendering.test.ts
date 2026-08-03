import {
	Activity,
	ErrorBoundary,
	Fragment,
	Suspense,
	activateTaskForHost,
	createEnhancementMarker,
	createContext,
	defineTask,
	markExactComponent,
	markExactEnhancementContexts,
	stageTaskMutation,
	type Child,
	type Component,
	type ErrorBoundaryFallbackProps
} from '@exactjs/core';
import { defineExactBoundaryContract, defineExactOperationContract } from '@exactjs/server';
import { describe, expect, it } from 'vitest';
import {
	createExactServerHandlerRegistry,
	diffBoundaryHtml,
	renderToString,
	renderToStringAsync
} from './index.js';
import { createVNode } from './test-support/native-vnode.js';

describe('@exactjs/ssr rendering', () => {
	it('renders bundle-local enhancements as ordinary server components', async () => {
		const identity = '@exactjs/ssr:test-enhancement#default';
		let tone: unknown;
		const Enhancement = markExactComponent(function Enhancement(
			this: Component<{}>,
			props: { children?: Child; tone?: string }
		) {
			tone = props.tone;
			return () => createVNode('aside', { 'data-enhanced': true }, props.children);
		}, '@exactjs/ssr:test-enhancement');
		const vnode = createVNode(
			'button',
			{
				__exactEnhancements: createEnhancementMarker([{ identity, props: { tone: 'quiet' } }])
			},
			'Save'
		);

		const output = renderToString(vnode, {
			markers: false,
			enhancementCatalog: new Map([[identity, Enhancement]])
		});
		const asyncOutput = await renderToStringAsync(vnode, {
			markers: false,
			enhancementCatalog: new Map([[identity, Enhancement]])
		});

		expect(output.html).toBe('<aside data-enhanced><button>Save</button></aside>');
		expect(asyncOutput.html).toBe(output.html);
		expect(tone).toBe('quiet');
	});

	it('leaves unavailable server enhancements inert and warns once per identity', () => {
		const identity = '@exactjs/ssr:missing#default';
		const events: Array<{ message: string }> = [];
		const marker = () => createEnhancementMarker([{ identity, props: { tone: 'quiet' } }]);
		const output = renderToString(
			createVNode(
				'section',
				null,
				createVNode('button', { __exactEnhancements: marker() }, 'One'),
				createVNode('button', { __exactEnhancements: marker() }, 'Two')
			),
			{ markers: false, logger: { log: (event) => events.push(event) } }
		);

		expect(output.html).toBe('<section><button>One</button><button>Two</button></section>');
		expect(events).toHaveLength(1);
		expect(events[0]?.message).toContain(identity);
	});

	it('activates a component-boundary enhancement inside contexts published by that component', async () => {
		const identity = '@exactjs/ssr:context-consumer#default';
		const Theme = createContext('ssr enhancement theme');
		const Enhancement = markExactEnhancementContexts(
			markExactComponent(function Enhancement(this: Component<{}>, props: { children?: Child }) {
				const theme = this.getContext(Theme);
				return () => createVNode('strong', { 'data-theme': theme }, props.children);
			}, '@exactjs/ssr:context-consumer'),
			{ requires: [Theme] }
		);
		const Boundary = markExactComponent(function Boundary(this: Component<{}>) {
			this.setContext(Theme, 'dark');
			return () => createVNode('button', null, 'Save');
		}, '@exactjs/ssr:context-boundary');

		const output = renderToString(
			createVNode(Boundary, {
				__exactEnhancements: createEnhancementMarker([{ identity, props: {} }])
			}),
			{ markers: false, enhancementCatalog: new Map([[identity, Enhancement]]) }
		);
		const asyncOutput = await renderToStringAsync(
			createVNode(Boundary, {
				__exactEnhancements: createEnhancementMarker([{ identity, props: {} }])
			}),
			{ markers: false, enhancementCatalog: new Map([[identity, Enhancement]]) }
		);

		expect(output.html).toBe('<strong data-theme="dark"><button>Save</button></strong>');
		expect(asyncOutput.html).toBe(output.html);
	});

	it('routes SSR structural output to an explicit logical intrinsic target', async () => {
		const identity = '@exactjs/ssr:routed#default';
		let boundarySetups = 0;
		let targetSetups = 0;
		let enhancementSetups = 0;
		const Enhancement = markExactComponent(function Enhancement(
			this: Component<{}>,
			props: { children?: Child }
		) {
			enhancementSetups++;
			return () => createVNode('aside', { 'data-enhanced': true }, props.children);
		}, '@exactjs/ssr:routed');
		const Target = markExactComponent(function Target(this: Component<{}>) {
			targetSetups++;
			return () =>
				createVNode(
					'main',
					{
						__exactEnhancements: createEnhancementMarker([{ identity, props: {}, root: true }])
					},
					'Target'
				);
		}, '@exactjs/ssr:routed-target');
		const Boundary = markExactComponent(function Boundary(this: Component<{}>) {
			boundarySetups++;
			return () => [createVNode('button', null, 'Fallback'), createVNode(Target, null)];
		}, '@exactjs/ssr:routed-boundary');

		const output = renderToString(
			createVNode(Boundary, {
				__exactEnhancements: createEnhancementMarker([{ identity, props: {} }])
			}),
			{ markers: false, enhancementCatalog: new Map([[identity, Enhancement]]) }
		);
		const asyncOutput = await renderToStringAsync(
			createVNode(Boundary, {
				__exactEnhancements: createEnhancementMarker([{ identity, props: {} }])
			}),
			{ markers: false, enhancementCatalog: new Map([[identity, Enhancement]]) }
		);

		expect(output.html).toBe(
			'<button>Fallback</button><aside data-enhanced><main>Target</main></aside>'
		);
		expect(asyncOutput.html).toBe(output.html);
		expect(boundarySetups).toBe(2);
		expect(targetSetups).toBe(2);
		expect(enhancementSetups).toBe(2);
	});

	it('reuses keyed list candidates materialized for SSR target routing', async () => {
		const identity = '@exactjs/ssr:routed-list#default';
		let renderedItems = 0;
		const Enhancement = markExactComponent(function Enhancement(
			this: Component<{}>,
			props: { children?: Child }
		) {
			return () => createVNode('strong', null, props.children);
		}, '@exactjs/ssr:routed-list');
		const Boundary = markExactComponent(function Boundary(this: Component<{}>) {
			return () =>
				createVNode(Fragment, {
					list: {
						collection: ['first', 'target'],
						key: (item: string) => item,
						render: (item: string) => {
							renderedItems++;
							return createVNode(
								'li',
								{
									__exactEnhancements: createEnhancementMarker([
										{ identity, props: {}, root: item === 'target' }
									])
								},
								item
							);
						}
					}
				});
		}, '@exactjs/ssr:routed-list-boundary');
		const render = () =>
			createVNode(Boundary, {
				__exactEnhancements: createEnhancementMarker([{ identity, props: {} }])
			});
		const options = {
			markers: false,
			enhancementCatalog: new Map([[identity, Enhancement]])
		} as const;

		const output = renderToString(render(), options);
		const asyncOutput = await renderToStringAsync(render(), options);

		expect(output.html).toBe('<li>first</li><strong><li>target</li></strong>');
		expect(asyncOutput.html).toBe(output.html);
		expect(renderedItems).toBe(4);
	});

	it('normalizes native class arrays and truthy maps', () => {
		const output = renderToString(
			createVNode('section', {
				className: ['panel', false, { active: true, hidden: false }, ['nested']]
			})
		).html;

		expect(output).toContain('class="panel active nested"');
	});

	it('reports opt-in string render timings', () => {
		const events: Array<{ subsystem: string; phase: string }> = [];

		expect(
			renderToString(createVNode('p', null, 'profiled'), {
				onProfile: (event) => events.push(event)
			}).html
		).toContain('profiled');
		expect(events).toContainEqual(
			expect.objectContaining({
				subsystem: 'ssr',
				phase: 'render-to-string'
			})
		);
	});

	it('preserves boolean attributes, quoted entities, and SVG tag casing in element diffs', () => {
		expect(
			diffBoundaryHtml(
				'field',
				'<input data-exact-id="field" disabled title="&quot;old&quot;">',
				'<input data-exact-id="field" disabled="true" title="&quot;new&quot;">',
				'element'
			)
		).toEqual(
			expect.arrayContaining([
				{ type: 'prop', id: 'field', name: 'disabled', value: 'true' },
				{ type: 'prop', id: 'field', name: 'title', value: '"new"' }
			])
		);
		const patches = diffBoundaryHtml(
			'icon',
			'<svg data-exact-id="icon"><linearGradient data-exact-id="paint"></linearGradient></svg>',
			'<svg data-exact-id="icon"><linearGradient data-exact-id="paint"><stop></stop></linearGradient></svg>',
			'element'
		);
		expect(JSON.stringify(patches)).toContain('linearGradient');
	});

	it('renders elements, attributes, text escaping, and styles to html', () => {
		const result = renderToString(
			createVNode(
				'section',
				{ className: 'panel', hidden: false, style: { color: 'red', marginTop: '4px' } },
				'Hello <Ada>',
				createVNode('input', { disabled: true, value: 'x"y' })
			),
			{ markers: false }
		);

		expect(result.html).toBe(
			'<section class="panel" style="color: red; margin-top: 4px;">Hello &lt;Ada&gt;<input disabled value="x&quot;y"></section>'
		);
	});

	it('emits active Activity content and leaves retained modes out of the document', async () => {
		const child = createVNode('p', null, 'retained');

		expect(
			renderToString(createVNode(Activity, { mode: 'active' }, child), { markers: false }).html
		).toBe('<p>retained</p>');
		expect(
			renderToString(createVNode(Activity, { mode: 'parked' }, child), { markers: false }).html
		).toBe('');
		expect(
			(
				await renderToStringAsync(createVNode(Activity, { mode: 'background' }, child), {
					markers: false
				})
			).html
		).toBe('');
	});

	it('renders native Suspense fallback synchronously and settled content asynchronously', async () => {
		function AsyncPanel(this: Component<{ label: string }>) {
			this.state.label = '';
			activateTaskForHost(
				this,
				defineTask({ readiness: 'blocking' }, async ({ signal }) => {
					const label = await Promise.resolve('ready');
					stageTaskMutation(signal, () => {
						this.state.label = label;
					});
				})
			);
			return () => createVNode('p', null, this.state.label);
		}
		const vnode = createVNode(
			Suspense,
			{ fallback: createVNode('span', null, 'loading') },
			createVNode(AsyncPanel, {})
		);

		expect(renderToString(vnode, { markers: false }).html).toBe('<span>loading</span>');
		expect((await renderToStringAsync(vnode, { markers: false })).html).toBe('<p>ready</p>');
	});

	it('routes an enhancement through the Suspense candidate selected by each SSR mode', async () => {
		const identity = '@exactjs/ssr:suspense-route#default';
		const Enhancement = markExactComponent(function Enhancement(
			this: Component<{}>,
			props: { children?: Child }
		) {
			return () => createVNode('strong', null, props.children);
		}, '@exactjs/ssr:suspense-route');
		function AsyncPanel(this: Component<{ label: string }>) {
			this.state.label = '';
			activateTaskForHost(
				this,
				defineTask({ readiness: 'blocking' }, async ({ signal }) => {
					const label = await Promise.resolve('ready');
					stageTaskMutation(signal, () => {
						this.state.label = label;
					});
				})
			);
			return () =>
				createVNode(
					'p',
					{
						__exactEnhancements: createEnhancementMarker([{ identity, props: {}, root: true }])
					},
					this.state.label
				);
		}
		const render = () =>
			createVNode(
				Suspense,
				{
					fallback: createVNode(
						'span',
						{
							__exactEnhancements: createEnhancementMarker([{ identity, props: {}, root: true }])
						},
						'loading'
					),
					__exactEnhancements: createEnhancementMarker([{ identity, props: {} }])
				},
				createVNode(AsyncPanel, {})
			);
		const options = {
			markers: false,
			enhancementCatalog: new Map([[identity, Enhancement]])
		} as const;

		expect(renderToString(render(), options).html).toBe('<strong><span>loading</span></strong>');
		expect((await renderToStringAsync(render(), options)).html).toBe(
			'<strong><p>ready</p></strong>'
		);
	});

	it('renders component output without marking components as mounted', () => {
		let mounted = false;

		function Card(this: Component<{ title: string }>, props: { title: string }) {
			this.state.title = props.title;
			this.onMount(() => {
				mounted = true;
			});
			return () => createVNode('article', null, this.state.title);
		}

		const result = renderToString(createVNode(Card, { title: 'Server' }));

		expect(result.html).toContain('<article>Server</article>');
		expect(result.html).toContain('<!--exact:component:');
		expect(mounted).toBe(false);
	});

	it('observes settled sync and async components before renderer disposal', async () => {
		const observed: number[] = [];
		let disposals = 0;
		function Observed(this: Component<{ value: number }>) {
			this.state.value = 1;
			activateTaskForHost(
				this,
				defineTask({}, async () => {
					await Promise.resolve();
					this.state.value++;
				})
			);
			this.onUnmount(() => {
				disposals++;
			});
			return () => createVNode('p', null, this.state.value);
		}

		renderToString(createVNode(Observed, {}), {
			onComponentRendered: (instance) => {
				observed.push(instance.state.value);
				expect(disposals).toBe(0);
			}
		});
		expect(observed).toEqual([1]);
		expect(disposals).toBe(1);

		observed.length = 0;
		disposals = 0;
		await renderToStringAsync(createVNode(Observed, {}), {
			onComponentRendered: (instance) => {
				observed.push(instance.state.value);
				expect(disposals).toBe(0);
			}
		});
		expect(observed).toEqual([2]);
		expect(disposals).toBe(1);
	});

	it('counts empty primitive child slots against the SSR breadth budget', () => {
		const vnode = createVNode('div', null, ...Array.from({ length: 20 }, () => null));
		expect(() => renderToString(vnode, { markers: false, maxTreeNodes: 8 })).toThrow(
			'eXact SSR tree exceeds the configured maximum of 8 render values'
		);
	});

	it('retains component fallback semantics for checked string rendering', () => {
		function Broken() {
			const style: Record<string, unknown> = {};
			Object.defineProperty(style, 'color', {
				enumerable: true,
				get() {
					throw new Error('attribute failed');
				}
			});
			return () => createVNode('p', { style }, 'broken');
		}

		expect(renderToString(createVNode(Broken, {}), { markers: false }).html).toContain(
			'exact-error'
		);
	});

	it('renders an error boundary fallback after async child construction fails', async () => {
		function Broken(): never {
			throw new Error('construction failed');
		}

		const result = await renderToStringAsync(
			createVNode(
				ErrorBoundary,
				{
					fallback: ({ error }: ErrorBoundaryFallbackProps) =>
						createVNode('p', null, String(error.error))
				},
				createVNode(Broken, {})
			),
			{ markers: false }
		);

		expect(result.html).toBe('<p>Error: construction failed</p>');
	});

	it('waits for async tasks before rendering a component in async mode', async () => {
		function Profile(this: Component<{ name: string }>) {
			this.state.name = 'Loading';
			activateTaskForHost(
				this,
				defineTask({}, async () => {
					await Promise.resolve();
					this.state.name = 'Ada';
				})
			);
			return () => createVNode('p', null, this.state.name);
		}

		const result = await renderToStringAsync(createVNode(Profile, {}), { markers: false });

		expect(result.html).toBe('<p>Ada</p>');
	});

	it('renders child components after their async tasks settle', async () => {
		function Child(this: Component<{ label: string }>) {
			this.state.label = 'Loading';
			activateTaskForHost(
				this,
				defineTask({}, async () => {
					await Promise.resolve();
					this.state.label = 'Ready';
				})
			);
			return () => createVNode('strong', null, this.state.label);
		}

		function Parent() {
			return () => createVNode('section', null, createVNode(Child, {}));
		}

		const result = await renderToStringAsync(createVNode(Parent, {}), { markers: false });

		expect(result.html).toBe('<section><strong>Ready</strong></section>');
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
				profile: () => createVNode('p', { className: 'saved' }, 'Saved'),
				private: () => createVNode('p', null, 'Private')
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
				profile: () => createVNode('p', null, 'Generated')
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
