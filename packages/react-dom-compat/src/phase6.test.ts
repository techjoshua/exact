/**
 * @vitest-environment jsdom
 */
import {
	Component,
	Suspense,
	createElement,
	lazy,
	useId,
	type ReactNode
} from '@exactjs/react-compat';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { createRoot, hydrateRoot } from './client.js';
import {
	preconnect,
	prefetchDNS,
	preinit,
	preinitModule,
	preload,
	preloadModule
} from './index.js';
import { renderToPipeableStream, renderToReadableStream, renderToString } from './server-node.js';

describe('React compatibility Phase 6 root hardening', () => {
	it('uses identifierPrefix deterministically across server rendering and hydration', () => {
		function Label() {
			const id = useId();
			return createElement('label', { htmlFor: id }, 'Name', createElement('input', { id }));
		}
		const tree = createElement(Label);
		const html = renderToString(tree, { identifierPrefix: 'account-' });
		expect(html).toContain('for=":account-exact-r1-0:"');
		expect(html).toContain('id=":account-exact-r1-0:"');

		const container = document.createElement('div');
		container.innerHTML = html;
		const input = container.querySelector('input');
		const recoverable = vi.fn();
		hydrateRoot(container, tree, { identifierPrefix: 'account-', onRecoverableError: recoverable });
		expect(container.querySelector('input')).toBe(input);
		expect(recoverable).not.toHaveBeenCalled();
	});

	it('routes caught and uncaught failures through React root callbacks', () => {
		const caught = vi.fn();
		const uncaught = vi.fn();
		class Boundary extends Component<{ children?: ReactNode }, { error?: Error }> {
			state: { error?: Error } = {};
			static getDerivedStateFromError(error: Error) {
				return { error };
			}
			render() {
				return this.state.error ? createElement('strong', null, 'caught') : this.props.children;
			}
		}
		function Broken(): never {
			throw new Error('boom');
		}

		const caughtContainer = document.createElement('div');
		createRoot(caughtContainer, { onCaughtError: caught }).render(
			createElement(Boundary, null, createElement(Broken))
		);
		expect(caughtContainer.textContent).toBe('caught');
		expect(caught).toHaveBeenCalledTimes(1);
		expect(caught.mock.calls[0]![0]).toMatchObject({ message: 'boom' });
		expect(caught.mock.calls[0]![1].errorBoundary).toBeInstanceOf(Boundary);

		const uncaughtContainer = document.createElement('div');
		createRoot(uncaughtContainer, { onUncaughtError: uncaught }).render(createElement(Broken));
		expect(uncaught).toHaveBeenCalledTimes(1);
		expect(uncaught.mock.calls[0]![0]).toMatchObject({ message: 'boom' });
		expect(uncaught.mock.calls[0]![1].componentStack).toContain('Broken');
	});

	it('normalizes specialized form, SVG, custom-element, style, and image server markup', () => {
		const tree = createElement(
			'section',
			null,
			createElement('input', { value: 'x', readOnly: true }),
			createElement('textarea', { defaultValue: 'a&b' }),
			createElement(
				'select',
				{ value: 'b', readOnly: true },
				createElement('option', { value: 'a' }, 'A'),
				createElement('option', { value: 'b' }, 'B')
			),
			createElement(
				'svg',
				{ viewBox: '0 0 1 1', strokeWidth: 2 },
				createElement('use', { xlinkHref: '#x' })
			),
			createElement('div', { style: { WebkitLineClamp: 2, msTransition: 'all', marginTop: 4 } }),
			createElement('x-widget', { className: 'widget', someProp: 'value', enabled: true }),
			createElement('img', { src: '/image.png', width: 10, height: 20 })
		);
		expect(renderToString(tree)).toBe(
			'<link rel="preload" as="image" href="/image.png"/><section>' +
				'<input readOnly="" value="x"/><textarea>a&amp;b</textarea>' +
				'<select readOnly=""><option value="a">A</option><option value="b" selected="">B</option></select>' +
				'<svg viewBox="0 0 1 1" stroke-width="2"><use xlink:href="#x"></use></svg>' +
				'<div style="-webkit-line-clamp:2;-ms-transition:all;margin-top:4px"></div>' +
				'<x-widget class="widget" someProp="value" enabled=""></x-widget>' +
				'<img src="/image.png" width="10" height="20"/></section>'
		);
	});

	it('emits React 19 bootstrap preloads and scripts on pipeable streams', async () => {
		const destination = new PassThrough();
		let html = '';
		destination.setEncoding('utf8');
		destination.on('data', (chunk) => {
			html += chunk;
		});
		const ended = new Promise<void>((resolve, reject) =>
			destination.on('end', resolve).on('error', reject)
		);
		renderToPipeableStream(createElement('main', null, 'x'), {
			bootstrapScriptContent: 'window.x=1;',
			bootstrapScripts: ['/a.js'],
			bootstrapModules: ['/m.js'],
			nonce: 'abc'
		}).pipe(destination);
		await ended;
		expect(html).toBe(
			'<link rel="preload" as="script" fetchPriority="low" nonce="abc" href="/a.js"/>' +
				'<link rel="modulepreload" fetchPriority="low" nonce="abc" href="/m.js"/>' +
				'<main>x</main><script nonce="abc" id="_R_">window.x=1;</script>' +
				'<script src="/a.js" nonce="abc" async=""></script>' +
				'<script type="module" src="/m.js" nonce="abc" async=""></script>'
		);
	});

	it('coordinates ReactDOM resource hints during server rendering', () => {
		function Resources() {
			prefetchDNS('https://dns.test');
			preconnect('https://cdn.test', { crossOrigin: 'use-credentials' });
			preload('/font.woff2', { as: 'font', crossOrigin: 'anonymous', type: 'font/woff2' });
			preloadModule('/mod.js', { as: 'script' });
			preinit('/style.css', { as: 'style', precedence: 'high', crossOrigin: 'anonymous' });
			preinit('/app.js', { as: 'script', nonce: 'n' });
			preinitModule('/entry.js', { nonce: 'm' });
			return createElement('main', null, 'resources');
		}
		expect(renderToString(createElement(Resources))).toBe(
			'<link href="https://dns.test" rel="dns-prefetch"/>' +
				'<link rel="preconnect" href="https://cdn.test" crossorigin="use-credentials"/>' +
				'<link rel="preload" href="/font.woff2" as="font" crossorigin="" type="font/woff2"/>' +
				'<link rel="stylesheet" href="/style.css" data-precedence="high" crossorigin=""/>' +
				'<script src="/app.js" async="" nonce="n"></script>' +
				'<script src="/entry.js" type="module" async="" nonce="m"></script>' +
				'<link rel="modulepreload" href="/mod.js"/><main>resources</main>'
		);
	});

	it('waits for Suspense resources in all-ready streams and supports abort', async () => {
		const LazyValue = lazy(() =>
			Promise.resolve({ default: () => createElement('b', null, 'ready') })
		);
		const stream = await renderToReadableStream(
			createElement(
				Suspense,
				{ fallback: createElement('i', null, 'loading') },
				createElement(LazyValue)
			)
		);
		await stream.allReady;
		expect(await new Response(stream).text()).toBe('<b>ready</b>');

		const controller = new AbortController();
		const Pending = lazy(() => new Promise<{ default: () => null }>(() => {}));
		const rendering = renderToReadableStream(
			createElement(Suspense, { fallback: 'waiting' }, createElement(Pending)),
			{ signal: controller.signal }
		);
		controller.abort(new Error('cancelled'));
		await expect(rendering).rejects.toThrow('cancelled');
	});

	it('preserves user-edited form state when a hydration mismatch is replaced', () => {
		const container = document.createElement('div');
		container.innerHTML = '<input name="email" value="server"><p>mismatch</p>';
		const input = container.querySelector('input')!;
		input.value = 'user@example.test';
		hydrateRoot(
			container,
			createElement(
				'section',
				null,
				createElement('input', { name: 'email', defaultValue: 'client' })
			)
		);
		expect(container.querySelector<HTMLInputElement>('input[name="email"]')?.value).toBe(
			'user@example.test'
		);
	});
});
