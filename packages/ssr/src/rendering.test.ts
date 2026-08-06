import {
	Activity,
	Fragment,
	Suspense,
	Target as TargetBoundary,
	activateTaskForHost,
	createEnhancementMarker,
	createContext,
	defineTask,
	markExactComponent,
	markExactEnhancementContexts,
	stageTaskMutation,
	type Child,
	type Component
} from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { diffBoundaryHtml, renderToString, renderToStringAsync } from './index.js';
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

	it('composes an enhancement directly around an underscore fragment boundary', () => {
		const identity = '@exactjs/ssr:fragment-enhancement#default';
		const Enhancement = markExactComponent(function Enhancement(
			this: Component<{}>,
			props: { children?: Child }
		) {
			return () => createVNode('aside', null, props.children);
		}, '@exactjs/ssr:fragment-enhancement');
		const output = renderToString(
			createVNode(
				Fragment,
				{ __exactEnhancements: createEnhancementMarker([{ identity, props: {} }]) },
				'Before',
				createVNode('strong', null, 'After')
			),
			{ markers: false, enhancementCatalog: new Map([[identity, Enhancement]]) }
		);

		expect(output.html).toBe('<aside>Before<strong>After</strong></aside>');
	});

	it('forwards ordinary target properties through structural component output', async () => {
		const Field = markExactComponent(function Field(
			this: Component<{}>,
			props: { children?: Child }
		) {
			return () =>
				createVNode(
					'label',
					{ className: 'field' },
					createVNode('span', null, 'Account'),
					createVNode(
						TargetBoundary,
						{
							className: 'control shared',
							style: { color: 'red', paddingTop: '4px' },
							'aria-describedby': 'description shared'
						},
						props.children
					),
					createVNode('small', { id: 'description' }, 'Help')
				);
		}, '@exactjs/ssr:target-field');
		const vnode = createVNode(
			Field,
			null,
			createVNode('input', {
				className: 'authored shared',
				style: { color: 'green' },
				'aria-describedby': 'authored shared'
			})
		);
		const output = renderToString(vnode, { markers: false });
		const asyncOutput = await renderToStringAsync(vnode, { markers: false });

		expect(output.html).toBe(
			'<label class="field"><span>Account</span><input class="authored shared control" style="color: green; padding-top: 4px;" aria-describedby="authored shared description"><small id="description">Help</small></label>'
		);
		expect(asyncOutput.html).toBe(output.html);
	});

	it('serializes nested target layers with authored and nearest-owner precedence', async () => {
		const vnode = createVNode(
			TargetBoundary,
			{
				className: 'outer shared',
				style: { color: 'red', marginTop: '2px' },
				'aria-describedby': 'outer shared',
				'data-tone': 'outer'
			},
			createVNode(
				TargetBoundary,
				{
					className: 'inner shared',
					style: { color: 'blue', paddingTop: '4px' },
					'aria-describedby': 'inner shared',
					'data-tone': 'inner'
				},
				createVNode('button', {
					className: 'authored shared',
					style: { color: 'green' },
					'aria-describedby': 'authored shared',
					title: null
				})
			)
		);
		const output = renderToString(vnode, { markers: false });
		const asyncOutput = await renderToStringAsync(vnode, { markers: false });

		expect(output.html).toBe(
			'<button class="authored shared inner outer" style="color: green; margin-top: 2px; padding-top: 4px;" aria-describedby="authored shared inner outer" data-tone="inner"></button>'
		);
		expect(asyncOutput.html).toBe(output.html);
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

	it('stops SSR root selection at the first root-bearing frame', async () => {
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
			'<aside data-enhanced><button>Fallback</button></aside><main>Target</main>'
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

	it('forwards one target layer to the Suspense branch selected by each SSR mode', async () => {
		function AsyncTarget(this: Component<{ label: string }>) {
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
		const render = () =>
			createVNode(
				TargetBoundary,
				{ className: 'owned' },
				createVNode(
					Suspense,
					{ fallback: createVNode('span', null, 'loading') },
					createVNode(AsyncTarget, {})
				)
			);

		expect(renderToString(render(), { markers: false }).html).toBe(
			'<span class="owned">loading</span>'
		);
		expect((await renderToStringAsync(render(), { markers: false })).html).toBe(
			'<p class="owned">ready</p>'
		);
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
});
