import { BLOCKED_JAVASCRIPT_URL, unsafeHtml } from '@exactjs/core';
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
import { createOperation } from './test-support/native-operations.js';
import {
	ExactDocument,
	LayeredDocument,
	PendingDocument,
	SuspenseDocument,
	configureDocumentOptions
} from './documents-security.fixtures.test.js';
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
			() => createOperation('main', null, createOperation('h1', null, 'Ready')),
			{ hydration: false, markers: false }
		);
		const chunks: string[] = [];

		await exactResponseBodyOf(response)?.writeTo((chunk) => {
			chunks.push(chunk);
		});

		expect(chunks.length).toBeGreaterThanOrEqual(3);
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
				createOperation(
					'html',
					null,
					createOperation('head', null, createOperation('title', null, 'Document')),
					createOperation('body', null, createOperation('main', null, 'Ready'))
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
				createOperation('div', {
					dangerouslySetInnerHTML: { __html: '<b>no</b>' }
				}),
				{ markers: false }
			)
		).toThrow(/unsafeHtml/);
	});

	it('requires explicit unsafe HTML opt-in and emits audit metadata', () => {
		const raw = '<script>globalThis.compromised=true</script><b>raw</b>';
		const vnode = createOperation('div', null, unsafeHtml(raw));
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
			renderToString(createOperation('iframe', { srcdoc: '<p>untrusted</p>' }), { markers: false })
		).toThrow(/unsafeHtml/);
		expect(() =>
			renderToString(createOperation('iframe', { srcdoc: unsafeHtml('<p>trusted</p>') }), {
				markers: false
			})
		).toThrow(/allowUnsafeHtml/);

		const observed: Array<{ characters: number }> = [];
		const result = renderToString(
			createOperation('iframe', { srcdoc: unsafeHtml('<p>trusted</p>') }),
			{
				markers: false,
				allowUnsafeHtml: true,
				onUnsafeHtml: (event) => observed.push(event)
			}
		);
		expect(result.html).toBe('<iframe srcdoc="&lt;p&gt;trusted&lt;/p&gt;"></iframe>');
		expect(observed).toEqual([{ characters: 14 }]);
	});

	it('applies the javascript URL guard to SSR attributes', () => {
		const result = renderToString(
			createOperation('a', { href: 'java\nscript:alert(1)' }, 'blocked'),
			{
				markers: false
			}
		);
		expect(result.html).toContain(`href="${BLOCKED_JAVASCRIPT_URL}"`);
	});

	it('renders intrinsic scripts in place with executable text and standard attributes', () => {
		const result = renderToString(
			createOperation(
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
		const result = renderToString(createOperation(ExactDocument, null), { markers: false });
		expect(result.html).toMatch(
			/^<!doctype html><html data-exact-id="[^"]+" lang="en"><head data-exact-id="[^"]+"><title>Exact<\/title><\/head><body data-exact-id="[^"]+"><main>ready<\/main><\/body><\/html>$/
		);
	});

	it('synthesizes unambiguous missing document regions', () => {
		expect(
			renderToString(createOperation('html', null, createOperation('main', null, 'ready')), {
				markers: false
			}).html
		).toBe('<!doctype html><html><head></head><body><main>ready</main></body></html>');
		expect(
			renderToString(createOperation('html', null, createOperation('head', null)), {
				markers: false
			}).html
		).toBe('<!doctype html><html><head></head><body></body></html>');
	});

	it('rejects duplicate, nested, and ambiguous document structure', () => {
		expect(() =>
			renderToString(
				createOperation('html', null, createOperation('head', null), createOperation('head', null))
			)
		).toThrow(/at most one <head>/);
		expect(() =>
			renderToString(createOperation('div', null, createOperation('html', null)))
		).toThrow(/nested or duplicate <html>/);
		expect(() =>
			renderToString(
				createOperation('html', null, createOperation('body', null), createOperation('main', null))
			)
		).toThrow(/ambiguous/);
	});

	it('keeps the doctype first when a document streams through component layers', async () => {
		const html = await readStreamText(
			renderToStream(createOperation(LayeredDocument, null), { markers: false })
		);
		expect(html).toMatch(
			/^<!doctype html><html data-exact-id="[^"]+"><head data-exact-id="[^"]+"><\/head><body data-exact-id="[^"]+">streamed<\/body><\/html>$/
		);
	});

	it('keeps progressive document output structurally valid through hydration augmentation', async () => {
		const html = await readStreamText(
			renderToHydratableProgressiveHtmlStream(
				createOperation('html', null, createOperation('body', null, 'progressive'))
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
			render: (value) => createOperation('p', null, value)
		});
		expect(first.items[0]!.html).not.toBe(first.items[1]!.html);
		expect(
			parseKeyedListSnapshotHtml('list', first.innerHtml)?.items.map((item) => item.key)
		).toEqual(['ab', 'a--b']);
	});

	it('streams document render events', async () => {
		const stream = renderToDocumentStream(createOperation('p', null, 'streamed'), {
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
		let settle!: () => void;
		configureDocumentOptions(new Promise<void>((resolve) => (settle = resolve)));
		const reader = renderToDocumentStream(createOperation(SuspenseDocument, {}), {
			hydration: false
		}).getReader();
		const events = [await readStreamEvent(reader), await readStreamEvent(reader)];
		settle();
		events.push(...(await readRemainingStreamEvents(reader)));

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
			renderToHydratableDocumentStream(createOperation('p', null, 'ready'), {
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
		const reader = renderToDocumentStream(createOperation(PendingDocument, {}), {
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
