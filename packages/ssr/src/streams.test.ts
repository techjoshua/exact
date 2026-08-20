import {
	activateTaskForHost,
	createEnhancementMarker,
	defineTask,
	type Child,
	type Component
} from '@exactjs/core';
import { markExactComponent } from '@exactjs/core/framework/component-contracts';
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
import { createVNode } from './test-support/native-vnode.js';

describe('@exactjs/ssr streams', () => {
	it('supports inert progressive replacement payloads without inline execution', async () => {
		let resolveTask!: () => void;
		const taskReady = new Promise<void>((resolve) => {
			resolveTask = resolve;
		});
		function Deferred(this: Component<{ value: string }>) {
			this.state.value = 'shell';
			activateTaskForHost(
				this,
				defineTask({}, async () => {
					await taskReady;
					this.state.value = 'settled';
				})
			);
			return () => createVNode('p', null, this.state.value);
		}

		const reader = renderToProgressiveHtmlStream(createVNode(Deferred, null), {
			progressiveMode: 'inert',
			rootId: 'app'
		}).getReader();
		expect(new TextDecoder().decode((await reader.read()).value)).toContain('<p>shell</p>');
		resolveTask();
		const remaining = await readRemainingStreamText(reader);
		expect(remaining).toContain('data-exact-progressive-payload=');
		expect(remaining).toContain('&quot;operation&quot;:&quot;replace&quot;');
		expect(remaining).not.toContain('<script');
	});

	it('can expose rendered html as a readable stream', async () => {
		const stream = renderToStream(createVNode('p', null, 'streamed'), { markers: false });
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
		const identity = '@exactjs/ssr:stream-enhancement#default';
		let targetSetups = 0;
		const Enhancement = markExactComponent(function Enhancement(
			this: Component<{}>,
			props: { children?: Child }
		) {
			return () => createVNode('aside', null, props.children);
		}, '@exactjs/ssr:stream-enhancement');
		const Target = markExactComponent(function Target(this: Component<{}>) {
			targetSetups++;
			return () =>
				createVNode('main', {
					__exactEnhancements: createEnhancementMarker([{ identity, props: {}, root: true }])
				});
		}, '@exactjs/ssr:stream-target');
		const Boundary = markExactComponent(function Boundary(this: Component<{}>) {
			return () => [createVNode('header', null), createVNode(Target, null)];
		}, '@exactjs/ssr:stream-boundary');
		const reader = renderToStream(
			createVNode(Boundary, {
				__exactEnhancements: createEnhancementMarker([{ identity, props: {} }])
			}),
			{
				markers: false,
				enhancementCatalog: new Map([[identity, Enhancement]])
			}
		).getReader();

		expect(await readRemainingStreamText(reader)).toBe(
			'<aside><header></header></aside><main></main>'
		);
		expect(targetSetups).toBe(1);
	});

	it('does not construct streamed components until the consumer requests bytes', async () => {
		let constructions = 0;
		function Lazy() {
			constructions++;
			return () => createVNode('section', null, createVNode('p', null, 'streamed'));
		}
		const reader = renderToStream(createVNode(Lazy, {}), { markers: false }).getReader();
		expect(constructions).toBe(0);

		expect(new TextDecoder().decode((await reader.read()).value)).toBe('<section>');
		expect(constructions).toBe(1);
		await reader.cancel();
	});

	it('disposes a plain HTML stream immediately when its request signal aborts', async () => {
		const abort = new AbortController();
		let taskSignal: AbortSignal | undefined;
		function Pending(this: Component<{}>) {
			activateTaskForHost(
				this,
				defineTask({}, ({ signal }) => {
					taskSignal = signal;
				})
			);
			return () => createVNode('p', null, 'pending');
		}
		const reader = renderToStream(createVNode(Pending, {}), {
			markers: false,
			signal: abort.signal
		}).getReader();
		await reader.read();
		expect(taskSignal?.aborted).toBe(false);

		abort.abort('disconnected');
		expect(taskSignal?.aborted).toBe(true);
		await expect(reader.read()).rejects.toBe('disconnected');
	});

	it('bounds broad trees in sync, async, and streaming renders', async () => {
		const vnode = createVNode(
			'main',
			null,
			...Array.from({ length: 12 }, (_, index) => createVNode('p', null, String(index)))
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
		function Profile(this: Component<{ name: string }>) {
			this.state.name = 'Loading';
			activateTaskForHost(
				this,
				defineTask({}, async () => {
					await taskReady;
					this.state.name = 'Ada';
				})
			);
			return () => createVNode('p', null, this.state.name);
		}

		const reader = renderToDocumentStream(createVNode(Profile, {}), {
			markers: false,
			rootId: 'app',
			hydration: false
		}).getReader();

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
			renderToHydratableProgressiveHtmlStream(createVNode('p', null, 'ready'), {
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
		function Profile(this: Component<{ name: string }>) {
			this.state.name = 'Loading';
			activateTaskForHost(
				this,
				defineTask({}, async () => {
					await taskReady;
					this.state.name = '</script><strong>Ada</strong>';
				})
			);
			return () => createVNode('p', null, this.state.name);
		}

		const reader = renderToProgressiveHtmlStream(createVNode(Profile, {}), {
			markers: false,
			rootId: 'profile',
			nonce: 'abc"123'
		}).getReader();
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
		function Status(this: Component<{ value: string }>) {
			this.state.value = 'Loading';
			activateTaskForHost(
				this,
				defineTask({}, async () => {
					await taskReady;
					this.state.value = 'Ready';
				})
			);
			return () => createVNode('p', null, this.state.value);
		}

		const reader = renderToProgressiveHtmlStream(createVNode(Status, {}), {
			markers: false
		}).getReader();
		const first = await reader.read();

		expect(new TextDecoder().decode(first.value)).toBe('<div id="exact-root"><p>Loading</p></div>');

		resolveTask();
		const rest = await readRemainingText(reader);

		expect(rest).toContain('document.getElementById("exact-root")');
	});

	it('packages progressive html streams as neutral response objects', async () => {
		const response = renderToHydratableProgressiveHtmlResponse(createVNode('p', null, 'ready'), {
			markers: false,
			rootId: 'app',
			endpoint: '/__exact',
			status: 202,
			headers: { 'cache-control': 'no-store' }
		});

		expect(response.status).toBe(202);
		expect(response.headers).toMatchObject({
			'content-type': 'text/html; charset=utf-8',
			'cache-control': 'no-store'
		});
		expect(await readStreamText(response.stream!)).toContain('<div id="app"><p>ready</p></div>');
	});

	it('respects explicit progressive response content type headers', () => {
		const response = renderToProgressiveHtmlResponse(createVNode('p', null, 'ready'), {
			headers: { 'Content-Type': 'text/html' }
		});
		const overridden = renderToProgressiveHtmlResponse(createVNode('p', null, 'ready'), {
			headers: { 'Content-Type': 'text/html' },
			contentType: 'application/xhtml+xml'
		});

		expect(response.headers['Content-Type']).toBe('text/html');
		expect(overridden.headers['Content-Type']).toBe('application/xhtml+xml');
	});

	it('does not construct streamed components ahead of reader demand', async () => {
		let constructed = 0;
		function Lazy(this: Component<{}>) {
			constructed++;
			return () => createVNode('p', null, 'lazy');
		}
		const reader = renderToDocumentStream(createVNode(Lazy, {}), { markers: false }).getReader();
		await Promise.resolve();
		expect(constructed).toBe(0);
		expect(await readStreamEvent(reader)).toMatchObject({ event: 'start' });
		await Promise.resolve();
		expect(constructed).toBe(1);
		await reader.cancel();
	});

	it('does not construct progressive components ahead of reader demand', async () => {
		let constructed = 0;
		function Lazy(this: Component<{}>) {
			constructed++;
			return () => createVNode('p', null, 'lazy');
		}
		const reader = renderToProgressiveHtmlStream(createVNode(Lazy, {}), {
			markers: false
		}).getReader();
		await Promise.resolve();
		expect(constructed).toBe(0);
		expect(new TextDecoder().decode((await reader.read()).value)).toContain('lazy');
		expect(constructed).toBe(1);
		await reader.cancel();
	});

	it('enforces SSR stream byte budgets', async () => {
		const reader = renderToDocumentStream(createVNode('p', null, 'x'.repeat(100)), {
			markers: false,
			maxStreamBytes: 32
		}).getReader();
		expect(await readStreamEvent(reader)).toMatchObject({ event: 'start' });
		await expect(reader.read()).rejects.toThrow('byte limit');
	});
});
