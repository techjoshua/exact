import {
	BLOCKED_JAVASCRIPT_URL,
	Suspense,
	activateTaskForHost,
	defineTask,
	unsafeHtml,
	type Component
} from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { exactResponseBodyOf } from '@exactjs/server';
import {
	createExactServerRuntime,
	parseKeyedListSnapshotHtml,
	renderExactRequestToProgressiveHtmlResponse,
	renderKeyedListSnapshot,
	renderToDocumentStream,
	renderToHydratableDocumentStream,
	renderToHydratableProgressiveHtmlStream,
	renderToStream,
	renderToString
} from './index.js';
import { createVNode } from './test-support/native-vnode.js';
import {
	readRemainingStreamEvents,
	readStreamEvent,
	readStreamText
} from './test-support/streams.js';

describe('@exactjs/ssr documents-security', () => {
	it('preserves ordered renderer chunks through the Node response body handoff', async () => {
		const runtime = createExactServerRuntime({
			contract: { version: 1, invocations: {}, boundaries: {} }
		});
		const response = await renderExactRequestToProgressiveHtmlResponse(
			{ method: 'GET', url: 'https://example.test/' },
			runtime,
			() => createVNode('main', null, createVNode('h1', null, 'Ready')),
			{ hydration: false, markers: false }
		);
		const chunks: string[] = [];

		await exactResponseBodyOf(response)?.writeTo((chunk) => {
			chunks.push(chunk);
		});

		expect(chunks.length).toBeGreaterThan(3);
		expect(chunks.join('')).toBe('<div id="exact-root"><main><h1>Ready</h1></main></div>');
		await runtime.dispose?.();
	});

	it('preserves authored documents instead of adding a progressive root wrapper', async () => {
		const runtime = createExactServerRuntime({
			contract: { version: 1, invocations: {}, boundaries: {} }
		});
		const response = await renderExactRequestToProgressiveHtmlResponse(
			{
				method: 'GET',
				url: 'https://example.test/'
			},
			runtime,
			() =>
				createVNode(
					'html',
					null,
					createVNode('head', null, createVNode('title', null, 'Document')),
					createVNode('body', null, createVNode('main', null, 'Ready'))
				),
			{
				hydration: false,
				markers: false,
				rootId: 'ignored'
			}
		);
		expect(await readStreamText(response.stream!)).toBe(
			'<!doctype html><html><head><title>Document</title></head><body><main>Ready</main></body></html>'
		);
		await runtime.dispose?.();
	});

	it('rejects dangerouslySetInnerHTML outside React compatibility markup', () => {
		expect(() =>
			renderToString(
				createVNode('div', {
					dangerouslySetInnerHTML: { __html: '<b>no</b>' }
				}),
				{ markers: false }
			)
		).toThrow(/unsafeHtml/);
	});

	it('requires explicit unsafe HTML opt-in and emits audit metadata', () => {
		const raw = '<script>globalThis.compromised=true</script><b>raw</b>';
		const vnode = createVNode('div', null, unsafeHtml(raw));
		expect(() => renderToString(vnode, { markers: false })).toThrow(/allowUnsafeHtml/);

		const observed: Array<{ characters: number }> = [];
		const result = renderToString(vnode, {
			markers: false,
			allowUnsafeHtml: true,
			onUnsafeHtml: (event) => observed.push(event)
		});
		expect(result.html).toBe('<div><script>globalThis.compromised=true</script><b>raw</b></div>');
		expect(observed).toEqual([{ characters: raw.length }]);
	});

	it('routes iframe srcdoc through the unsafe HTML capability and root audit', () => {
		expect(() =>
			renderToString(createVNode('iframe', { srcdoc: '<p>untrusted</p>' }), { markers: false })
		).toThrow(/unsafeHtml/);
		expect(() =>
			renderToString(createVNode('iframe', { srcdoc: unsafeHtml('<p>trusted</p>') }), {
				markers: false
			})
		).toThrow(/allowUnsafeHtml/);

		const observed: Array<{ characters: number }> = [];
		const result = renderToString(createVNode('iframe', { srcdoc: unsafeHtml('<p>trusted</p>') }), {
			markers: false,
			allowUnsafeHtml: true,
			onUnsafeHtml: (event) => observed.push(event)
		});
		expect(result.html).toBe('<iframe srcdoc="&lt;p&gt;trusted&lt;/p&gt;"></iframe>');
		expect(observed).toEqual([{ characters: 14 }]);
	});

	it('applies the javascript URL guard to SSR attributes', () => {
		const result = renderToString(createVNode('a', { href: 'java\nscript:alert(1)' }, 'blocked'), {
			markers: false
		});
		expect(result.html).toContain(`href="${BLOCKED_JAVASCRIPT_URL}"`);
	});

	it('renders intrinsic scripts in place with executable text and standard attributes', () => {
		const result = renderToString(
			createVNode(
				'script',
				{
					type: 'module',
					noModule: true,
					nonce: 'request-nonce',
					crossOrigin: 'anonymous',
					referrerPolicy: 'no-referrer',
					fetchPriority: 'low'
				},
				"globalThis.tracked = '</not-a-tag>';"
			),
			{ markers: false }
		);
		expect(result.html).toBe(
			'<script type="module" nomodule nonce="request-nonce" crossorigin="anonymous" ' +
				'referrerpolicy="no-referrer" fetchpriority="low">globalThis.tracked = \'</not-a-tag>\';</script>'
		);
	});

	it('normalizes a document returned through a root component', () => {
		function Document(this: Component<Record<string, never>>) {
			return () =>
				createVNode(
					'html',
					{ lang: 'en' },
					createVNode('head', null, createVNode('title', null, 'Exact')),
					createVNode('body', null, createVNode('main', null, 'ready'))
				);
		}

		const result = renderToString(createVNode(Document, null));
		expect(result.html).toBe(
			'<!doctype html><html lang="en"><head><title>Exact</title></head>' +
				'<body><main>ready</main></body></html>'
		);
	});

	it('synthesizes unambiguous missing document regions', () => {
		expect(
			renderToString(createVNode('html', null, createVNode('main', null, 'ready')), {
				markers: false
			}).html
		).toBe('<!doctype html><html><head></head><body><main>ready</main></body></html>');
		expect(
			renderToString(createVNode('html', null, createVNode('head', null)), { markers: false }).html
		).toBe('<!doctype html><html><head></head><body></body></html>');
	});

	it('rejects duplicate, nested, and ambiguous document structure', () => {
		expect(() =>
			renderToString(
				createVNode('html', null, createVNode('head', null), createVNode('head', null))
			)
		).toThrow(/at most one direct <head>/);
		expect(() => renderToString(createVNode('div', null, createVNode('html', null)))).toThrow(
			/nested or duplicate <html>/
		);
		expect(() =>
			renderToString(
				createVNode('html', null, createVNode('body', null), createVNode('main', null))
			)
		).toThrow(/ambiguous/);
	});

	it('keeps the doctype first when a document streams through component layers', async () => {
		function Inner(this: Component<Record<string, never>>) {
			return () => createVNode('html', null, createVNode('body', null, 'streamed'));
		}
		function Outer(this: Component<Record<string, never>>) {
			return () => createVNode(Inner, null);
		}

		const html = await readStreamText(renderToStream(createVNode(Outer, null)));
		expect(html).toBe('<!doctype html><html><head></head><body>streamed</body></html>');
	});

	it('keeps progressive document output structurally valid through hydration augmentation', async () => {
		const html = await readStreamText(
			renderToHydratableProgressiveHtmlStream(
				createVNode('html', null, createVNode('body', null, 'progressive'))
			)
		);
		expect(html.startsWith('<!doctype html><html>')).toBe(true);
		expect(html).toContain('<body>progressive<!--exact:framework-body:start-->');
		expect(html.endsWith('<!--exact:framework-body:end--></body></html>')).toBe(true);
		expect(html).not.toContain('<div id="exact-root"><!doctype');
	});

	it('encodes unsafe keyed marker values without collisions', () => {
		const first = renderKeyedListSnapshot({
			listId: 'list',
			items: ['ab', 'a--b'],
			key: (value) => value,
			render: (value) => createVNode('p', null, value)
		});
		expect(first.items[0]!.html).not.toBe(first.items[1]!.html);
		expect(
			parseKeyedListSnapshotHtml('list', first.innerHtml)?.items.map((item) => item.key)
		).toEqual(['ab', 'a--b']);
	});

	it('streams document render events', async () => {
		const stream = renderToDocumentStream(createVNode('p', null, 'streamed'), {
			markers: false,
			endpoint: '/__exact',
			state: { ready: true }
		});
		const events = await readRemainingStreamEvents(stream.getReader());

		expect(events).toEqual([
			{ event: 'start', version: 1 },
			{ event: 'shell', version: 1, html: '<p>streamed</p>' },
			{
				event: 'hydration',
				version: 1,
				html: expect.stringContaining('"endpoint":"/__exact"')
			},
			{ event: 'complete', version: 1 }
		]);
		expect(events[2].html).toContain('"ready":true');
	});

	it('streams a settled Suspense range without replacing stable siblings', async () => {
		function Options(this: Component<{ label: string }>) {
			this.state.label = '';
			activateTaskForHost(
				this,
				defineTask({ readiness: 'blocking' }, async () => {
					this.state.label = await Promise.resolve('Ground');
				})
			);
			return () => createVNode('p', null, this.state.label);
		}
		const events = await readRemainingStreamEvents(
			renderToDocumentStream(
				createVNode(
					'main',
					null,
					createVNode('h1', null, 'Shipping'),
					createVNode(
						Suspense,
						{ fallback: createVNode('i', null, 'Loading') },
						createVNode(Options, {})
					)
				),
				{ hydration: false }
			).getReader()
		);

		expect(events.find((event) => event.event === 'shell')?.html).toContain('Loading');
		expect(events.find((event) => event.event === 'replace')).toMatchObject({
			event: 'replace',
			id: expect.stringMatching(/^suspense-fallback:/),
			html: expect.stringContaining('Ground')
		});
		expect(events.find((event) => event.event === 'replace')?.id).not.toBe('document');
	});

	it('streams hydratable document bootstrap events', async () => {
		const events = await readRemainingStreamEvents(
			renderToHydratableDocumentStream(createVNode('p', null, 'ready'), {
				markers: false
			}).getReader()
		);

		expect(events).toEqual([
			{ event: 'start', version: 1 },
			{ event: 'shell', version: 1, html: '<p>ready</p>' },
			{
				event: 'hydration',
				version: 1,
				html: '<script type="application/json" id="__exact_hydration">{}</script>'
			},
			{ event: 'complete', version: 1 }
		]);
	});

	it('aborts document rendering without reporting cancellation as a render failure', async () => {
		const abort = new AbortController();
		const logs: unknown[] = [];
		function Pending(this: Component<{}>) {
			activateTaskForHost(
				this,
				defineTask({}, () => new Promise<void>(() => undefined))
			);
			return () => createVNode('p', null, 'Loading');
		}
		const reader = renderToDocumentStream(createVNode(Pending, {}), {
			signal: abort.signal,
			logger: { isEnabled: () => true, log: (entry) => logs.push(entry) }
		}).getReader();
		expect(await readStreamEvent(reader)).toMatchObject({ event: 'start' });
		expect(await readStreamEvent(reader)).toMatchObject({ event: 'shell' });
		abort.abort('disconnected');
		await expect(reader.read()).rejects.toBe('disconnected');
		expect(logs).toEqual([]);
	});
});
