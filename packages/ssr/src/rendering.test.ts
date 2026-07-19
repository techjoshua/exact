import { createVNode, type Component } from '@exact/core';
import { describe, expect, it } from 'vitest';
import {
	createExactServerHandlerRegistry,
	diffBoundaryHtml,
	renderToString,
	renderToStringAsync
} from './index.js';

describe('@exact/ssr rendering', () => {
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

	it('waits for async tasks before rendering a component in async mode', async () => {
		function Profile(this: Component<{ name: string }>) {
			this.state.name = 'Loading';
			this.task(async () => {
				await Promise.resolve();
				this.state.name = 'Ada';
			});
			return () => createVNode('p', null, this.state.name);
		}

		const result = await renderToStringAsync(createVNode(Profile, {}), { markers: false });

		expect(result.html).toBe('<p>Ada</p>');
	});

	it('renders child components after their async tasks settle', async () => {
		function Child(this: Component<{ label: string }>) {
			this.state.label = 'Loading';
			this.task(async () => {
				await Promise.resolve();
				this.state.label = 'Ready';
			});
			return () => createVNode('strong', null, this.state.label);
		}

		function Parent() {
			return () => createVNode('section', null, createVNode(Child, {}));
		}

		const result = await renderToStringAsync(createVNode(Parent, {}), { markers: false });

		expect(result.html).toBe('<section><strong>Ready</strong></section>');
	});

	it('creates manifest-scoped server handler registries', async () => {
		const registry = createExactServerHandlerRegistry({
			manifest: {
				version: 1,
				actions: {
					'save-profile': { id: 'save-profile', componentId: 'Profile', placement: 'server' }
				},
				boundaries: {
					profile: { id: 'profile', ownerComponentId: 'Profile' },
					private: { id: 'private', ownerComponentId: 'Private' }
				},
				actionBoundaries: {
					'save-profile': ['profile']
				}
			},
			markers: false,
			patchStrategy: 'element',
			actions: {
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
			{ manifest: { version: 1 } }
		);
		const action = await registry.actions['save-profile'](
			{
				type: 'action',
				id: 'save-profile',
				boundaryHtmls: {
					profile: '<p class="old">Loading</p>',
					private: '<p>Private</p>'
				}
			},
			{ manifest: { version: 1 } }
		);

		expect(Object.keys(registry.actions)).toEqual(['save-profile']);
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
