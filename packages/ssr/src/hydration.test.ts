import {
	createCompiledVNode,
	createDynamicChild,
	createVNode,
	type Component
} from '@exactjs/core';
import { registerReactiveListKey } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { renderHydrationScript, renderToHydratableString, renderToString } from './index.js';

describe('@exactjs/ssr hydration', () => {
	it('places framework hydration data inside the normalized body region', () => {
		const result = renderToHydratableString(
			createVNode(
				'html',
				null,
				createVNode('head', null),
				createVNode('body', null, createVNode('main', null, 'ready'))
			)
		);
		expect(result.htmlWithHydration).toContain(
			'<main>ready</main><!--exact:framework-body:start--><script type="application/json"'
		);
		expect(result.htmlWithHydration).toMatch(/<!--exact:framework-body:end--><\/body><\/html>$/);
	});

	it('encodes registered keyed hydration collections with hash metadata', () => {
		const records = [
			{ id: 'a', title: 'A' },
			{ id: 'b', title: 'B' }
		];
		registerReactiveListKey(
			records,
			(item) => (item as { id: string }).id,
			'hydration test',
			'member:id'
		);
		const html = renderHydrationScript({ state: { records } });
		const payload = JSON.parse(html.match(/>(.*)<\/script>/s)![1]) as any;
		expect(payload.state.records).toMatchObject({
			$exact: 'keyed-collection',
			version: 1,
			keys: ['a', 'b']
		});
		expect(payload.state.records.itemHashes).toHaveLength(2);
	});

	it('renders compiled cells and dynamic children with hydration markers', () => {
		function Panel(this: Component<{ show: boolean }>) {
			this.state.show = true;
			return () =>
				createCompiledVNode(
					'section',
					{},
					createDynamicChild(() =>
						this.state.show
							? createVNode('strong', null, 'Visible')
							: createVNode('span', null, 'Hidden')
					)
				);
		}

		const result = renderToString(createVNode(Panel, {}));

		expect(result.html).toContain('exact:component');
		expect(result.html).toContain('exact:cell');
		expect(result.html).toContain('exact:dynamic');
		expect(result.html).toContain('<strong>Visible</strong>');
	});

	it('serializes hydration endpoint and state as inert escaped json', () => {
		const script = renderHydrationScript({
			endpoint: '/__exact',
			endpoints: {
				actions: {
					'remote-save': 'https://remote.example/__exact'
				},
				boundaries: {
					'remote-panel': 'https://remote.example/__exact'
				}
			},
			state: { title: '</script><img>' },
			continuations: {
				save: {
					id: 'save',
					componentId: 'test:save',
					readiness: 'nonblocking',
					dependencies: [],
					stateReads: [{ path: 'project.id', kind: 'read', confidence: 'exact' }],
					stateWrites: [],
					publicContexts: [],
					serverContexts: [],
					contextWrites: [],
					boundaries: ['profile', 'profile:children']
				}
			},
			nonce: 'abc"123'
		});

		expect(script).toContain('type="application/json"');
		expect(script).toContain('id="__exact_hydration"');
		expect(script).toContain('nonce="abc&quot;123"');
		expect(script).toContain('"endpoints"');
		expect(script).toContain('"remote-save"');
		expect(script).toContain('https://remote.example/__exact');
		expect(script).toContain('"continuations"');
		expect(script).toContain('"profile:children"');
		expect(script).toContain('"project.id"');
		expect(script).toContain('\\u003C/script>');
		expect(script).not.toContain('</script><img>');
	});

	it('rejects non-json-safe hydration payloads', () => {
		expect(() =>
			renderHydrationScript({
				state: { onSave() {} }
			})
		).toThrow('Hydration payload must be JSON-serializable');

		expect(() =>
			renderHydrationScript({
				endpoints: {
					actions: {
						save: (() => '/__exact') as unknown as string
					}
				}
			})
		).toThrow('Hydration payload must be JSON-serializable');
	});

	it('renders html with hydration bootstrap data', () => {
		const result = renderToHydratableString(createVNode('p', null, 'ready'), {
			markers: false,
			endpoint: '/__exact',
			endpoints: {
				boundaries: {
					panel: 'https://remote.example/__exact'
				}
			},
			state: { ready: true },
			continuations: {
				save: {
					id: 'save',
					componentId: 'test:save',
					readiness: 'nonblocking',
					dependencies: [],
					stateReads: [{ path: 'ready', kind: 'read', confidence: 'exact' }],
					stateWrites: [],
					publicContexts: [],
					serverContexts: [],
					contextWrites: [],
					boundaries: []
				}
			}
		});

		expect(result.html).toBe('<p>ready</p>');
		expect(result.htmlWithHydration).toContain('<p>ready</p><script');
		expect(result.htmlWithHydration).toContain('"endpoint":"/__exact"');
		expect(result.htmlWithHydration).toContain('"endpoints"');
		expect(result.htmlWithHydration).toContain('"panel":"https://remote.example/__exact"');
		expect(result.htmlWithHydration).toContain('"ready":true');
		expect(result.htmlWithHydration).toContain('"continuations"');
	});
});
