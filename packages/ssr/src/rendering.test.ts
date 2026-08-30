import {
	Activity,
	Fragment,
	Suspense,
	Target as TargetBoundary,
	TargetOverrides,
	createEnhancementNode
} from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { diffBoundaryHtml, renderToString, renderToStringAsync } from './index.js';
import { createOperation } from './test-support/native-operations.js';
import {
	AsideEnhancement,
	AsyncPanel,
	AsyncTarget,
	ContextBoundary,
	ContextConsumerEnhancement,
	contextEnhancementIdentity,
	EnhancedAsyncPanel,
	readRenderingFixtureState,
	resetRenderingFixtureState,
	RoutedBoundary,
	RoutedEnhancement,
	routedEnhancementIdentity,
	RoutedListBoundary,
	RoutedListEnhancement,
	routedListEnhancementIdentity,
	SuspenseRouteEnhancement,
	suspenseEnhancementIdentity,
	TargetField,
	ToneEnhancement
} from './rendering.fixtures.test.js';

describe('@exactjs/ssr rendering', () => {
	it('serializes native controlled selections as option state in sync and async output', async () => {
		const vnode = createOperation(
			'select',
			{ value: 'second' },
			createOperation('option', { value: 'first' }, 'First'),
			createOperation('option', { value: 'second' }, 'Second')
		);

		const sync = renderToString(vnode, { markers: false });
		const asyncResult = await renderToStringAsync(vnode, { markers: false });

		expect(sync.html).toBe(
			'<select value="second"><option value="first">First</option><option value="second" selected>Second</option></select>'
		);
		expect(asyncResult.html).toBe(sync.html);
	});

	it('renders bundle-local enhancements as ordinary server components', async () => {
		const identity = '@exactjs/ssr:test-enhancement#default';
		resetRenderingFixtureState();
		const vnode = createOperation(
			'button',
			{
				__exactEnhancements: createEnhancementNode([{ identity, props: { tone: 'quiet' } }])
			},
			'Save'
		);

		const output = renderToString(vnode, {
			markers: false,
			enhancementCatalog: new Map([[identity, ToneEnhancement]])
		});
		const asyncOutput = await renderToStringAsync(vnode, {
			markers: false,
			enhancementCatalog: new Map([[identity, ToneEnhancement]])
		});

		expect(output.html).toBe('<aside data-enhanced><button>Save</button></aside>');
		expect(asyncOutput.html).toBe(output.html);
		expect(readRenderingFixtureState().observedTone).toBe('quiet');
	});

	it('applies a target-producing enhancement before rendering a native component', async () => {
		const identity = '@exactjs/ssr:component-target-enhancement#default';
		const render = () =>
			createOperation(ContextBoundary, {
				__exactEnhancements: createEnhancementNode([{ identity, props: {} }])
			});
		const options = {
			markers: false,
			enhancementCatalog: new Map([[identity, TargetField]])
		} as const;

		const sync = renderToString(render(), options);
		const asyncResult = await renderToStringAsync(render(), options);

		expect(sync.html).toBe(
			'<label class="field"><span>Account</span><button class="control shared" style="color: red; padding-top: 4px;" aria-describedby="description shared">Save</button><small id="description">Help</small></label>'
		);
		expect(asyncResult.html).toBe(sync.html);
	});

	it('composes an enhancement directly around an underscore fragment boundary', () => {
		const identity = '@exactjs/ssr:fragment-enhancement#default';
		const output = renderToString(
			createOperation(
				Fragment,
				{ __exactEnhancements: createEnhancementNode([{ identity, props: {} }]) },
				'Before',
				createOperation('strong', null, 'After')
			),
			{ markers: false, enhancementCatalog: new Map([[identity, AsideEnhancement]]) }
		);

		expect(output.html).toBe('<aside>Before<strong>After</strong></aside>');
	});

	it('forwards ordinary target properties through structural component output', async () => {
		const vnode = createOperation(
			TargetField,
			null,
			createOperation('input', {
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
		const vnode = createOperation(
			TargetBoundary,
			{
				className: 'outer shared',
				style: { color: 'red', marginTop: '2px' },
				'aria-describedby': 'outer shared',
				'data-tone': 'outer'
			},
			createOperation(
				TargetBoundary,
				{
					className: 'inner shared',
					style: { color: 'blue', paddingTop: '4px' },
					'aria-describedby': 'inner shared',
					'data-tone': 'inner'
				},
				createOperation('button', {
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

	it('keeps a direct intrinsic authoritative before a later nested target in a fragment', async () => {
		const vnode = createOperation(
			TargetBoundary,
			{ className: 'outer' },
			createOperation(
				Fragment,
				null,
				createOperation('section', { id: 'host' }, 'Host'),
				createOperation(
					TargetBoundary,
					{ className: 'inner' },
					createOperation('h2', null, 'Heading')
				)
			)
		);
		const output = renderToString(vnode, { markers: false });
		const asyncOutput = await renderToStringAsync(vnode, { markers: false });

		expect(output.html).toBe(
			'<section id="host" class="outer">Host</section><h2 class="inner">Heading</h2>'
		);
		expect(asyncOutput.html).toBe(output.html);
	});

	it('serializes framework-owned target fallback overrides', () => {
		const output = renderToString(
			createOperation(
				TargetBoundary,
				{ placeholder: 'Translated', [TargetOverrides]: ['placeholder'] },
				createOperation('input', { placeholder: 'Fallback', id: 'search' })
			),
			{ markers: false }
		);

		expect(output.html).toBe('<input placeholder="Translated" id="search">');
	});

	it('leaves unavailable server enhancements inert and warns once per identity', () => {
		const identity = '@exactjs/ssr:missing#default';
		const events: Array<{ message: string }> = [];
		const marker = () => createEnhancementNode([{ identity, props: { tone: 'quiet' } }]);
		const output = renderToString(
			createOperation(
				'section',
				null,
				createOperation('button', { __exactEnhancements: marker() }, 'One'),
				createOperation('button', { __exactEnhancements: marker() }, 'Two')
			),
			{ markers: false, logger: { log: (event) => events.push(event) } }
		);

		expect(output.html).toBe('<section><button>One</button><button>Two</button></section>');
		expect(events).toHaveLength(1);
		expect(events[0]?.message).toContain(identity);
	});

	it('activates a component-boundary enhancement inside contexts published by that component', async () => {
		const output = renderToString(
			createOperation(ContextBoundary, {
				__exactEnhancements: createEnhancementNode([
					{ identity: contextEnhancementIdentity, props: {} }
				])
			}),
			{
				markers: false,
				enhancementCatalog: new Map([[contextEnhancementIdentity, ContextConsumerEnhancement]])
			}
		);
		const asyncOutput = await renderToStringAsync(
			createOperation(ContextBoundary, {
				__exactEnhancements: createEnhancementNode([
					{ identity: contextEnhancementIdentity, props: {} }
				])
			}),
			{
				markers: false,
				enhancementCatalog: new Map([[contextEnhancementIdentity, ContextConsumerEnhancement]])
			}
		);

		expect(output.html).toBe('<strong data-theme="dark"><button>Save</button></strong>');
		expect(asyncOutput.html).toBe(output.html);
	});

	it('stops SSR root selection at the first root-bearing frame', async () => {
		resetRenderingFixtureState();

		const output = renderToString(
			createOperation(RoutedBoundary, {
				__exactEnhancements: createEnhancementNode([
					{ identity: routedEnhancementIdentity, props: {} }
				])
			}),
			{
				markers: false,
				enhancementCatalog: new Map([[routedEnhancementIdentity, RoutedEnhancement]])
			}
		);
		const asyncOutput = await renderToStringAsync(
			createOperation(RoutedBoundary, {
				__exactEnhancements: createEnhancementNode([
					{ identity: routedEnhancementIdentity, props: {} }
				])
			}),
			{
				markers: false,
				enhancementCatalog: new Map([[routedEnhancementIdentity, RoutedEnhancement]])
			}
		);

		expect(output.html).toMatch(
			/^<aside data-enhanced><button>Fallback<\/button><\/aside><main data-exact-id="[^"]+">Target<\/main>$/
		);
		expect(asyncOutput.html).toBe(output.html);
		expect(readRenderingFixtureState()).toMatchObject({
			boundarySetups: 2,
			targetSetups: 2,
			enhancementSetups: 2
		});
	});

	it('reuses keyed list candidates materialized for SSR target routing', async () => {
		resetRenderingFixtureState();
		const render = () =>
			createOperation(RoutedListBoundary, {
				__exactEnhancements: createEnhancementNode([
					{ identity: routedListEnhancementIdentity, props: {} }
				])
			});
		const options = {
			markers: false,
			enhancementCatalog: new Map([[routedListEnhancementIdentity, RoutedListEnhancement]])
		} as const;

		const output = renderToString(render(), options);
		const asyncOutput = await renderToStringAsync(render(), options);

		expect(output.html).toMatch(
			/^<li data-exact-id="([^"]+)">first<\/li><strong><li data-exact-id="\1">target<\/li><\/strong>$/
		);
		expect(asyncOutput.html).toBe(output.html);
		expect(readRenderingFixtureState().renderedItems).toBe(4);
	});

	it('normalizes native class arrays and truthy maps', () => {
		const output = renderToString(
			createOperation('section', {
				className: ['panel', false, { active: true, hidden: false }, ['nested']]
			})
		).html;

		expect(output).toContain('class="panel active nested"');
	});

	it('reports opt-in string render timings', () => {
		const events: Array<{ subsystem: string; phase: string }> = [];

		expect(
			renderToString(createOperation('p', null, 'profiled'), {
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
			createOperation(
				'section',
				{ className: 'panel', hidden: false, style: { color: 'red', marginTop: '4px' } },
				'Hello <Ada>',
				createOperation('input', { disabled: true, value: 'x"y' })
			),
			{ markers: false }
		);

		expect(result.html).toBe(
			'<section class="panel" style="color: red; margin-top: 4px;">Hello &lt;Ada&gt;<input disabled value="x&quot;y"></section>'
		);
	});

	it('emits active Activity content and leaves retained modes out of the document', async () => {
		const child = createOperation('p', null, 'retained');

		expect(
			renderToString(createOperation(Activity, { mode: 'active' }, child), { markers: false }).html
		).toBe('<p>retained</p>');
		expect(
			renderToString(createOperation(Activity, { mode: 'parked' }, child), { markers: false }).html
		).toBe('');
		expect(
			(
				await renderToStringAsync(createOperation(Activity, { mode: 'background' }, child), {
					markers: false
				})
			).html
		).toBe('');
	});

	it('renders native Suspense fallback synchronously and settled content asynchronously', async () => {
		const vnode = createOperation(
			Suspense,
			{ fallback: createOperation('span', null, 'loading') },
			createOperation(AsyncPanel, {})
		);

		expect(renderToString(vnode, { markers: false }).html).toBe('<span>loading</span>');
		expect((await renderToStringAsync(vnode, { markers: false })).html).toBe('<p>ready</p>');
	});

	it('forwards one target layer to the Suspense branch selected by each SSR mode', async () => {
		const render = () =>
			createOperation(
				TargetBoundary,
				{ className: 'owned' },
				createOperation(
					Suspense,
					{ fallback: createOperation('span', null, 'loading') },
					createOperation(AsyncTarget, {})
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
		const observedLabels: unknown[] = [];
		const standalone = await renderToStringAsync(createOperation(EnhancedAsyncPanel, {}), {
			markers: false,
			onDirectComponentRendered: (snapshot) => observedLabels.push(snapshot.state.label)
		});
		expect(observedLabels).toEqual(['ready']);
		expect(standalone.html).toMatch(/^<p data-exact-id="[^"]+">ready<\/p>$/);
		const render = () =>
			createOperation(
				Suspense,
				{
					fallback: createOperation(
						'span',
						{
							__exactEnhancements: createEnhancementNode([
								{ identity: suspenseEnhancementIdentity, props: {}, root: true }
							])
						},
						'loading'
					),
					__exactEnhancements: createEnhancementNode([
						{ identity: suspenseEnhancementIdentity, props: {} }
					])
				},
				createOperation(EnhancedAsyncPanel, {})
			);
		const options = {
			markers: false,
			enhancementCatalog: new Map([[suspenseEnhancementIdentity, SuspenseRouteEnhancement]])
		} as const;

		expect(renderToString(render(), options).html).toBe('<strong><span>loading</span></strong>');
		expect((await renderToStringAsync(render(), options)).html).toMatch(
			/^<strong><p data-exact-id="[^"]+">ready<\/p><\/strong>$/
		);
	});
});
