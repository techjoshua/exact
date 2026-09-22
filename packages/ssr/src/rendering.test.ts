import {
	Activity,
	createEnhancementNode,
	Fragment,
	Suspense,
	Target as TargetBoundary,
	TargetOverrides
} from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { diffBoundaryHtml, renderToStream, renderToString } from './index.js';
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
	suspenseEnhancementIdentity,
	SuspenseRouteEnhancement,
	TargetField,
	ToneEnhancement
} from './rendering.fixtures.test.js';
import { readStreamText } from './test-support/streams.js';
import { createOperation } from './test-support/native-operations.js';

describe('@exactjs/ssr rendering', () => {
	it('serializes native controlled selections as option state in string and streaming output', async () => {
		const vnode = createOperation(
			'select',
			{ value: 'second' },
			createOperation('option', { value: 'first' }, 'First'),
			createOperation('option', { value: 'second' }, 'Second')
		);

		const result = await renderToString(vnode, { markers: false });
		const streamed = await readStreamText(renderToStream(vnode, { markers: false }));

		expect(result.html).toBe(
			'<select value="second"><option value="first">First</option><option value="second" selected>Second</option></select>'
		);
		expect(streamed).toBe(result.html);
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

		const output = await renderToString(vnode, {
			markers: false,
			enhancementCatalog: new Map([[identity, ToneEnhancement]])
		});
		const streamed = await readStreamText(
			renderToStream(vnode, {
				markers: false,
				enhancementCatalog: new Map([[identity, ToneEnhancement]])
			})
		);

		expect(output.html).toBe('<aside data-enhanced><button>Save</button></aside>');
		expect(streamed).toBe(output.html);
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

		const result = await renderToString(render(), options);
		const streamed = await readStreamText(renderToStream(render(), options));

		expect(result.html).toBe(
			'<label class="field"><span>Account</span><button class="control shared" style="color: red; padding-top: 4px;" aria-describedby="description shared">Save</button><small id="description">Help</small></label>'
		);
		expect(streamed).toBe(result.html);
	});

	it('composes an enhancement directly around an underscore fragment boundary', async () => {
		const identity = '@exactjs/ssr:fragment-enhancement#default';
		const output = await renderToString(
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
		const output = await renderToString(vnode, { markers: false });
		const streamed = await readStreamText(renderToStream(vnode, { markers: false }));

		expect(output.html).toBe(
			'<label class="field"><span>Account</span><input class="authored shared control" style="color: green; padding-top: 4px;" aria-describedby="authored shared description"><small id="description">Help</small></label>'
		);
		expect(streamed).toBe(output.html);
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
		const output = await renderToString(vnode, { markers: false });
		const streamed = await readStreamText(renderToStream(vnode, { markers: false }));

		expect(output.html).toBe(
			'<button class="authored shared inner outer" style="color: green; margin-top: 2px; padding-top: 4px;" aria-describedby="authored shared inner outer" data-tone="inner"></button>'
		);
		expect(streamed).toBe(output.html);
	});

	it('keeps an ordinary supplied fragment transparent without promoting props', async () => {
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
		const output = await renderToString(vnode, { markers: false });
		const streamed = await readStreamText(renderToStream(vnode, { markers: false }));

		expect(output.html).toBe('<section id="host">Host</section><h2 class="inner">Heading</h2>');
		expect(streamed).toBe(output.html);
	});

	it('serializes framework-owned target fallback overrides', async () => {
		const output = await renderToString(
			createOperation(
				TargetBoundary,
				{ placeholder: 'Translated', [TargetOverrides]: ['placeholder'] },
				createOperation('input', { placeholder: 'Fallback', id: 'search' })
			),
			{ markers: false }
		);

		expect(output.html).toBe('<input placeholder="Translated" id="search">');
	});

	it('leaves unavailable server enhancements inert and warns once per identity', async () => {
		const identity = '@exactjs/ssr:missing#default';
		const events: Array<{ message: string }> = [];
		const marker = () => createEnhancementNode([{ identity, props: { tone: 'quiet' } }]);
		const output = await renderToString(
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
		const output = await renderToString(
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
		const streamed = await readStreamText(
			renderToStream(
				createOperation(ContextBoundary, {
					__exactEnhancements: createEnhancementNode([
						{ identity: contextEnhancementIdentity, props: {} }
					])
				}),
				{
					markers: false,
					enhancementCatalog: new Map([[contextEnhancementIdentity, ContextConsumerEnhancement]])
				}
			)
		);

		expect(output.html).toBe('<strong data-theme="dark"><button>Save</button></strong>');
		expect(streamed).toBe(output.html);
	});

	it('stops SSR root selection at the first root-bearing frame', async () => {
		resetRenderingFixtureState();

		const output = await renderToString(
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
		const streamed = await readStreamText(
			renderToStream(
				createOperation(RoutedBoundary, {
					__exactEnhancements: createEnhancementNode([
						{ identity: routedEnhancementIdentity, props: {} }
					])
				}),
				{
					markers: false,
					enhancementCatalog: new Map([[routedEnhancementIdentity, RoutedEnhancement]])
				}
			)
		);

		expect(output.html).toMatch(
			/^<aside data-enhanced><button>Fallback<\/button><\/aside><main data-exact-id="[^"]+">Target<\/main>$/
		);
		expect(streamed).toBe(output.html);
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

		const output = await renderToString(render(), options);
		const streamed = await readStreamText(renderToStream(render(), options));

		expect(output.html).toMatch(
			/^<li data-exact-id="([^"]+)">first<\/li><strong><li data-exact-id="\1">target<\/li><\/strong>$/
		);
		expect(streamed).toBe(output.html);
		expect(readRenderingFixtureState().renderedItems).toBe(4);
	});

	it('normalizes native class arrays and truthy maps', async () => {
		const output = (
			await renderToString(
				createOperation('section', {
					className: ['panel', false, { active: true, hidden: false }, ['nested']]
				})
			)
		).html;

		expect(output).toContain('class="panel active nested"');
	});

	it('reports opt-in string render timings', async () => {
		const events: Array<{ subsystem: string; phase: string }> = [];

		expect(
			(
				await renderToString(createOperation('p', null, 'profiled'), {
					onProfile: (event) => events.push(event)
				})
			).html
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

	it('renders elements, attributes, text escaping, and styles to html', async () => {
		const result = await renderToString(
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
			(
				await renderToString(createOperation(Activity, { mode: 'active' }, child), {
					markers: false
				})
			).html
		).toBe('<p>retained</p>');
		expect(
			(
				await renderToString(createOperation(Activity, { mode: 'parked' }, child), {
					markers: false
				})
			).html
		).toBe('');
		expect(
			(
				await renderToString(createOperation(Activity, { mode: 'background' }, child), {
					markers: false
				})
			).html
		).toBe('');
	});

	it('waits for native Suspense content when collecting a string', async () => {
		const vnode = createOperation(
			Suspense,
			{ fallback: createOperation('span', null, 'loading') },
			createOperation(AsyncPanel, {})
		);
		expect((await renderToString(vnode, { markers: false })).html).toBe('<p>ready</p>');
	});

	it('forwards one target layer to the Suspense branch after blocking work settles', async () => {
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
		expect((await renderToString(render(), { markers: false })).html).toBe(
			'<p class="owned">ready</p>'
		);
	});

	it('routes an enhancement through the Suspense candidate selected by each SSR mode', async () => {
		const observedLabels: unknown[] = [];
		const standalone = await renderToString(createOperation(EnhancedAsyncPanel, {}), {
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
		expect((await renderToString(render(), options)).html).toMatch(
			/^<strong><p data-exact-id="[^"]+">ready<\/p><\/strong>$/
		);
	});
});
