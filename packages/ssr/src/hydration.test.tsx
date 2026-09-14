/* eslint-disable @typescript-eslint/no-explicit-any -- This test intentionally models external, private, or invalid values that production contracts reject. */
import { registerReactiveListKey } from '@exactjs/reactive';
import { describe, expect, it, vi } from 'vitest';
import {
	HydrationPanel,
	PositionalPublishedRoot,
	renderAccessorPositionalPublishedRoot,
	renderMismatchedPositionalPublishedRoot,
	renderMissingPositionalPublishedRoot,
	renderPositionalPublishedRoot,
	renderPublishedRoot
} from './hydration.fixtures.test.js';
import { renderHydrationScriptWithByteCount } from './hydration.js';
import {
	renderHydrationScript,
	renderToHydratableProgressiveHtmlStream,
	renderToHydratableString,
	renderToString
} from './index.js';
import { createOperation } from './test-support/native-operations.js';
import { readStreamText } from './test-support/streams.js';

describe('@exactjs/ssr hydration', () => {
	it('uses adapter byte accounting without changing hydration bytes or byte limits', () => {
		const options = {
			state: { message: '\u6f22\u5b57\ud83d\ude80</script>\u2028\u2029\ud800' },
			scriptId: '\u6f22-hydration',
			nonce: '\u5b57'
		};
		const encodedByteLength = vi.fn((value: string) => Buffer.byteLength(value));
		const target: { hydrationBytes?: number } = {};
		const html = renderHydrationScriptWithByteCount(
			options,
			undefined,
			undefined,
			target,
			encodedByteLength
		);
		expect(html).toBe(renderHydrationScript(options));
		expect(target.hydrationBytes).toBe(Buffer.byteLength(html));
		expect(encodedByteLength).toHaveBeenCalledOnce();
		const payload = encodedByteLength.mock.calls[0]![0];
		const payloadBytes = Buffer.byteLength(payload);
		expect(() =>
			renderHydrationScriptWithByteCount(
				{ ...options, maxHydrationBytes: payloadBytes },
				undefined,
				undefined,
				{},
				encodedByteLength
			)
		).not.toThrow();
		expect(() =>
			renderHydrationScriptWithByteCount(
				{ ...options, maxHydrationBytes: payloadBytes - 1 },
				undefined,
				undefined,
				{},
				encodedByteLength
			)
		).toThrow('maxHydrationBytes');
	});

	it('places framework hydration data inside the normalized body region', async () => {
		const result = await renderToHydratableString(
			createOperation(
				'html',
				null,
				createOperation('head', null),
				createOperation('body', null, createOperation('main', null, 'ready'))
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

	it('serializes only the compact component authorization identity', () => {
		const script = renderHydrationScript({
			componentAuthorization: {
				protocol: 1,
				buildKey: 'build-one',
				fingerprint: 'authorization-one'
			}
		});
		const payload = JSON.parse(script.match(/>(.*)<\/script>/s)![1]) as any;

		expect(payload.componentAuthorization).toEqual({
			protocol: 1,
			buildKey: 'build-one',
			fingerprint: 'authorization-one'
		});
		expect(script).not.toContain('packages');
	});

	it('publishes component authorization through every hydratable entry point', async () => {
		const componentAuthorization = {
			protocol: 1 as const,
			buildKey: 'build-one',
			fingerprint: 'authorization-one'
		};
		const vnode = createOperation('p', null, 'ready');
		const options = { buildKey: 'build-one', componentAuthorization };

		const buffered = (await renderToHydratableString(vnode, options)).hydrationScript;
		const progressive = await readStreamText(
			renderToHydratableProgressiveHtmlStream(vnode, options)
		);

		for (const output of [buffered, progressive]) {
			expect(output).toContain('authorization-one');
			expect(output).toContain('[1,12288');
		}
	});

	it('omits empty hydration metadata without removing authored empty state', () => {
		const script = renderHydrationScript({
			endpoints: { invocations: {}, boundaries: {} },
			state: { items: [], selection: {} },
			publicContexts: {},
			continuations: {
				refresh: {
					id: 'refresh',
					componentId: 'test:refresh',
					kind: 'task',
					readiness: 'nonblocking',
					dependencies: [],
					stateReads: [],
					stateWrites: [],
					publicContexts: [],
					serverContexts: ['PrivateRepository'],
					contextWrites: [],
					serverContextWrites: ['PrivateStatus'],
					boundaries: []
				}
			},
			resumptions: [
				{ componentId: 'test:refresh', values: {}, contexts: {}, settledContinuations: [] }
			]
		});
		const payload = JSON.parse(script.match(/>(.*)<\/script>/s)![1]) as any;

		expect(payload).not.toHaveProperty('endpoints');
		expect(payload).not.toHaveProperty('publicContexts');
		expect(payload.state).toEqual({ items: [], selection: {} });
		expect(payload.continuations.refresh).toEqual({
			id: 'refresh',
			componentId: 'test:refresh',
			kind: 'task',
			readiness: 'nonblocking'
		});
		expect(payload.resumptions).toEqual([['test:refresh']]);
	});

	it('rejects component authorization prepared for another build', () => {
		expect(() =>
			renderHydrationScript({
				buildKey: 'build-one',
				componentAuthorization: {
					protocol: 1,
					buildKey: 'build-two',
					fingerprint: 'authorization-two'
				}
			})
		).toThrow('does not match the hydration build key');
	});

	it('renders compiler-owned conditional children through the component ABI', async () => {
		const result = await renderToString(createOperation(HydrationPanel, {}));

		expect(result.html).toContain('exact:component');
		expect(result.html).toContain('<strong>Visible</strong>');
	});

	it('publishes root props from a compiler-closed root', async () => {
		const result = await renderPublishedRoot('published');
		expect(directHydrationField(result.hydrationScript, 8)).toEqual({ label: 'published' });
	});

	it('publishes compiler-proven nested root props positionally', async () => {
		const result = await renderPositionalPublishedRoot();
		expect(directHydrationField(result.hydrationScript, 8)).toEqual([
			expect.any(String),
			[[['first', [true]]], 'queue']
		]);
	});

	it('retains named root props when runtime values exceed the finite schema', async () => {
		const result = await renderMismatchedPositionalPublishedRoot();
		expect(directHydrationField(result.hydrationScript, 8)).toEqual({
			rows: [{ id: 'first', detail: { ready: true, source: 'runtime' } }],
			label: 'queue'
		});
	});

	it('reads compiler-declared positional root fields once into getter-free output', async () => {
		const onRead = vi.fn();
		const result = await renderAccessorPositionalPublishedRoot(onRead);

		expect(directHydrationField(result.hydrationScript, 8)).toEqual([
			expect.any(String),
			[[['first', [true]]], 'queue']
		]);
		expect(onRead).toHaveBeenCalledTimes(1);
	});

	it('retains named root props when a runtime object substitutes another own field', async () => {
		const result = await renderMissingPositionalPublishedRoot();

		expect(directHydrationField(result.hydrationScript, 8)).toEqual({
			rows: [{ id: 'first', detail: { source: true } }],
			label: 'queue'
		});
	});

	it('applies hydration graph limits during positional root traversal', async () => {
		await expect(
			renderToHydratableString(
				createOperation(PositionalPublishedRoot, {
					rows: [{ id: 'first', detail: { ready: true } }],
					label: 'queue'
				}),
				{ publishRootProps: true, maxHydrationNodes: 2 }
			)
		).rejects.toThrow('Hydration payload must be JSON-serializable');
	});

	it('captures indexed resumptions while preserving lazy public activations', async () => {
		const result = await renderToHydratableString(createOperation(HydrationPanel, {}));
		const descriptor = Object.getOwnPropertyDescriptor(result, 'resumptions');
		const resumptions = directHydrationField(result.hydrationScript, 64) as unknown[];

		expect(descriptor?.get).toBeTypeOf('function');
		expect(resumptions).toContainEqual([expect.any(String), [[0, true]]]);
		expect(result.resumptions).toContainEqual(expect.objectContaining({ values: { show: true } }));
	});

	it('applies hydration graph limits to direct indexed resumptions', async () => {
		await expect(
			renderToHydratableString(createOperation(HydrationPanel, {}), { maxHydrationNodes: 1 })
		).rejects.toThrow('Hydration payload must be JSON-serializable');
	});

	it('projects named resumptions before invoking hydration output extensions', async () => {
		let observed: unknown;
		await renderToHydratableString(createOperation(HydrationPanel, {}), {
			outputExtensions: [
				{
					transform(value, context) {
						if (context.kind === 'hydration')
							observed = (value as { resumptions?: unknown }).resumptions;
						return value;
					}
				}
			]
		});

		expect(observed).toContainEqual(expect.objectContaining({ values: { show: true } }));
	});

	it('publishes the compact compiler-closed root proof', () => {
		const script = renderHydrationScript({ markerlessRoot: true });
		expect(JSON.parse(script.match(/>(.*)<\/script>/s)![1])).toEqual({ m: 1 });
	});

	it('serializes hydration endpoint and state as inert escaped json', () => {
		const script = renderHydrationScript({
			endpoint: '/__exact',
			endpoints: {
				invocations: {
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
					kind: 'task',
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
					invocations: {
						save: (() => '/__exact') as unknown as string
					}
				}
			})
		).toThrow('Hydration payload must be JSON-serializable');
	});

	it('renders html with hydration bootstrap data', async () => {
		const result = await renderToHydratableString(createOperation('p', null, 'ready'), {
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
					kind: 'task',
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
		expect(directHydrationField(result.hydrationScript, 2)).toBe('/__exact');
		expect(directHydrationField(result.hydrationScript, 4)).toEqual({
			boundaries: { panel: 'https://remote.example/__exact' }
		});
		expect(result.htmlWithHydration).toContain('"panel":"https://remote.example/__exact"');
		expect(result.htmlWithHydration).toContain('"ready":true');
		expect(directHydrationField(result.hydrationScript, 32)).toHaveProperty('save');
	});
});

function directHydrationField(script: string, expectedBit: number): unknown {
	const tuple = JSON.parse(script.match(/>(.*)<\/script>/s)![1]) as unknown[];
	const mask = tuple[1] as number;
	let index = 2;
	for (let bit = 1; bit <= 8192; bit *= 2) {
		if ((mask & bit) === 0) continue;
		if (bit === 16) {
			if (bit === expectedBit) return 1;
			continue;
		}
		if (bit === expectedBit) return tuple[index];
		index++;
	}
	return undefined;
}
