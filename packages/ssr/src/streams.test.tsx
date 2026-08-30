import { describe, expect, it } from 'vitest';
import {
	renderToDocumentStream,
	renderToHydratableProgressiveHtmlResponse,
	renderToHydratableProgressiveHtmlStream,
	renderToProgressiveHtmlResponse,
	renderToProgressiveHtmlStream,
	renderToStream,
	renderToString,
	renderToStringAsync
} from './index.js';
import {
	readRemainingStreamEvents,
	readRemainingStreamText,
	readRemainingText,
	readStreamEvent,
	readStreamText
} from './test-support/streams.js';
import { createOperation } from './test-support/native-operations.js';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-abi';
import {
	configureControlledText,
	ControlledText,
	LazyParagraph,
	LazySection,
	readRoutedStreamTargetSetups,
	ReceiptStreamRoot,
	resetRoutedStreamFixture,
	RoutedStreamPage
} from './streams.fixtures.test.js';
import { StreamEnhancement } from './streams-enhancement.fixtures.test.js';

const streamEnhancementIdentity = './stream-enhancements.fixtures.test.js#routed';

describe('@exactjs/ssr streams', () => {
	it('streams an opaque compiler component receipt without a VNode root', async () => {
		const reader = renderToStream(createCompiledComponentReceipt(ReceiptStreamRoot, null), {
			markers: false
		}).getReader();
		expect(await readRemainingStreamText(reader)).toBe('<p>receipt stream</p>');
	});

	it('supports inert progressive replacement payloads without inline execution', async () => {
		let resolveTask!: () => void;
		const taskReady = new Promise<void>((resolve) => {
			resolveTask = resolve;
		});
		configureControlledText(taskReady);
		const reader = renderToProgressiveHtmlStream(
			createOperation(ControlledText, {
				initial: 'shell',
				settled: 'settled'
			}),
			{
				progressiveMode: 'inert',
				rootId: 'app'
			}
		).getReader();
		expect(new TextDecoder().decode((await reader.read()).value)).toContain('<p>shell</p>');
		resolveTask();
		const remaining = await readRemainingStreamText(reader);
		expect(remaining).toContain('data-exact-progressive-payload=');
		expect(remaining).toContain('&quot;operation&quot;:&quot;replace&quot;');
		expect(remaining).not.toContain('<script');
	});

	it('can expose rendered html as a readable stream', async () => {
		const stream = renderToStream(createOperation('p', null, 'streamed'), { markers: false });
		const reader = stream.getReader();
		const chunks: string[] = [];
		const decoder = new TextDecoder();

		while (true) {
			const result = await reader.read();
			if (result.done) break;
			chunks.push(decoder.decode(result.value));
		}

		expect(chunks.join('')).toBe('<p>streamed</p>');
	});

	it('streams a routed enhancement without reconstructing its logical target', async () => {
		resetRoutedStreamFixture();
		const reader = renderToStream(createOperation(RoutedStreamPage, null), {
			markers: false,
			enhancementCatalog: new Map([[streamEnhancementIdentity, StreamEnhancement]])
		}).getReader();

		expect(await readRemainingStreamText(reader)).toMatch(
			/^<aside><header><\/header><\/aside><main data-exact-id="[^"]+"><\/main>$/
		);
		expect(readRoutedStreamTargetSetups()).toBe(1);
	});

	it('does not construct streamed components until the consumer requests bytes', async () => {
		let constructions = 0;
		const reader = renderToStream(
			createOperation(LazySection, { constructed: () => constructions++ }),
			{ markers: false }
		).getReader();
		expect(constructions).toBe(0);

		expect(new TextDecoder().decode((await reader.read()).value)).toBe(
			'<section><p>streamed</p></section>'
		);
		expect(constructions).toBe(1);
		await reader.cancel();
	});

	it('bounds broad trees in sync, async, and streaming renders', async () => {
		const vnode = createOperation(
			'main',
			null,
			...Array.from({ length: 12 }, (_, index) => createOperation('p', null, String(index)))
		);

		expect(() => renderToString(vnode, { markers: false, maxTreeNodes: 5 })).toThrow(
			'eXact SSR tree exceeds the configured maximum of 5 render values'
		);
		await expect(renderToStringAsync(vnode, { markers: false, maxTreeNodes: 5 })).rejects.toThrow(
			'eXact SSR tree exceeds the configured maximum of 5 render values'
		);
		const reader = renderToStream(vnode, { markers: false, maxTreeNodes: 5 }).getReader();
		await expect(
			(async () => {
				while (!(await reader.read()).done) {
					/* consume lazily */
				}
			})()
		).rejects.toThrow('eXact SSR tree exceeds the configured maximum of 5 render values');
	});

	it('streams the initial shell before async tasks settle', async () => {
		let resolveTask!: () => void;
		const taskReady = new Promise<void>((resolve) => {
			resolveTask = resolve;
		});
		configureControlledText(taskReady);
		const reader = renderToDocumentStream(
			createOperation(ControlledText, {
				initial: 'Loading',
				settled: 'Ada'
			}),
			{
				markers: false,
				rootId: 'app',
				hydration: false
			}
		).getReader();

		expect(await readStreamEvent(reader)).toEqual({ event: 'start', version: 1 });
		expect(await readStreamEvent(reader)).toEqual({
			event: 'shell',
			version: 1,
			html: '<p>Loading</p>'
		});

		resolveTask();
		const rest = await readRemainingStreamEvents(reader);

		expect(rest).toEqual([
			{ event: 'replace', version: 1, id: 'app', html: '<p>Ada</p>' },
			{ event: 'complete', version: 1 }
		]);
	});

	it('streams progressive browser-consumable html', async () => {
		const html = await readStreamText(
			renderToHydratableProgressiveHtmlStream(createOperation('p', null, 'ready'), {
				markers: false,
				rootId: 'app',
				endpoint: '/__exact'
			})
		);

		expect(html).toContain('<div id="app"><p>ready</p></div>');
		expect(html).toContain('<script type="application/json" id="__exact_hydration">');
		expect(html).toContain('"endpoint":"/__exact"');
	});

	it('streams progressive html shell before async task replacement', async () => {
		let resolveTask!: () => void;
		const taskReady = new Promise<void>((resolve) => {
			resolveTask = resolve;
		});
		configureControlledText(taskReady);
		const reader = renderToProgressiveHtmlStream(
			createOperation(ControlledText, {
				initial: 'Loading',
				settled: '</script><strong>Ada</strong>'
			}),
			{
				markers: false,
				rootId: 'profile',
				nonce: 'abc"123'
			}
		).getReader();
		const first = await reader.read();

		expect(new TextDecoder().decode(first.value)).toBe('<div id="profile"><p>Loading</p></div>');

		resolveTask();
		const rest = await readRemainingText(reader);

		expect(rest).toContain('document.getElementById("profile")');
		expect(rest).toContain('<script nonce="abc&quot;123">');
		expect(rest).toContain('&lt;/script&gt;');
		expect(rest).toContain('\\u003Cp>');
		expect(rest).not.toContain('</script><strong>');
	});

	it('uses the same default root for progressive shell and replacement', async () => {
		let resolveTask!: () => void;
		const taskReady = new Promise<void>((resolve) => {
			resolveTask = resolve;
		});
		configureControlledText(taskReady);
		const reader = renderToProgressiveHtmlStream(
			createOperation(ControlledText, {
				initial: 'Loading',
				settled: 'Ready'
			}),
			{
				markers: false
			}
		).getReader();
		const first = await reader.read();

		expect(new TextDecoder().decode(first.value)).toBe('<div id="exact-root"><p>Loading</p></div>');

		resolveTask();
		const rest = await readRemainingText(reader);

		expect(rest).toContain('document.getElementById("exact-root")');
	});

	it('packages progressive html streams as neutral response objects', async () => {
		const response = renderToHydratableProgressiveHtmlResponse(
			createOperation('p', null, 'ready'),
			{
				markers: false,
				rootId: 'app',
				endpoint: '/__exact',
				status: 202,
				headers: { 'cache-control': 'no-store' }
			}
		);

		expect(response.status).toBe(202);
		expect(response.headers).toMatchObject({
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'no-store'
		});
		expect(await readStreamText(response.stream!)).toContain('<div id="app"><p>ready</p></div>');
	});

	it('respects explicit progressive response content type headers', () => {
		const response = renderToProgressiveHtmlResponse(createOperation('p', null, 'ready'), {
			headers: { 'Content-Type': 'text/html' }
		});
		const overridden = renderToProgressiveHtmlResponse(createOperation('p', null, 'ready'), {
			headers: { 'Content-Type': 'text/html' },
			contentType: 'application/xhtml+xml'
		});

		expect(response.headers['Content-Type']).toBe('text/html');
		expect(overridden.headers['Content-Type']).toBe('application/xhtml+xml');
	});

	it('does not construct streamed components ahead of reader demand', async () => {
		let constructed = 0;
		const reader = renderToDocumentStream(
			createOperation(LazyParagraph, { constructed: () => constructed++ }),
			{ markers: false }
		).getReader();
		await Promise.resolve();
		expect(constructed).toBe(0);
		expect(await readStreamEvent(reader)).toMatchObject({ event: 'start' });
		await readStreamEvent(reader);
		expect(constructed).toBe(1);
		await reader.cancel();
	});

	it('does not construct progressive components ahead of reader demand', async () => {
		let constructed = 0;
		const reader = renderToProgressiveHtmlStream(
			createOperation(LazyParagraph, {
				constructed: () => constructed++
			}),
			{
				markers: false
			}
		).getReader();
		await Promise.resolve();
		expect(constructed).toBe(0);
		expect(new TextDecoder().decode((await reader.read()).value)).toContain('lazy');
		expect(constructed).toBe(1);
		await reader.cancel();
	});

	it('enforces SSR stream byte budgets', async () => {
		const reader = renderToDocumentStream(createOperation('p', null, 'x'.repeat(100)), {
			markers: false,
			maxStreamBytes: 32
		}).getReader();
		expect(await readStreamEvent(reader)).toMatchObject({ event: 'start' });
		await expect(reader.read()).rejects.toThrow('byte limit');
	});
});
