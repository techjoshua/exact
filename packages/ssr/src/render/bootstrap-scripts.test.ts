import { Script } from 'node:vm';
import { expect, it } from 'vitest';
import { renderAfterLoadBootstrap, renderDocumentScripts } from './bootstrap-scripts.js';

it('keeps descriptor text inside the script and escapes the CSP nonce', () => {
	const html = renderAfterLoadBootstrap(
		[{ src: '</script><script>attack()</script>\u2028' }],
		'"<>'
	);
	expect(html.match(/<script/g)).toHaveLength(1);
	expect(html.match(/<\/script>/g)).toHaveLength(1);
	expect(html).toContain('nonce="&quot;&lt;&gt;"');
	expect(html).toContain('\\u003c/script>');
});

it.each(['loading', 'complete'])(
	'starts once and preserves ordered native script attributes when document is %s',
	async (readyState) => {
		let start: (() => void) | undefined;
		const inserted: Record<string, unknown>[] = [];
		const anchor = {
			parentNode: {
				insertBefore(element: Record<string, unknown>, before: unknown) {
					expect(before).toBe(anchor);
					inserted.push(element);
				}
			}
		};
		const html = renderAfterLoadBootstrap(
			[
				{ src: '/first.js', integrity: 'sha256-first', crossOrigin: 'use-credentials' },
				{ src: '/second.js', type: 'classic' }
			],
			'nonce'
		);
		new Script(html.slice(html.indexOf('>') + 1, html.lastIndexOf('</script>'))).runInNewContext({
			document: { readyState, currentScript: anchor, createElement: () => ({}) },
			window: {
				addEventListener(type: string, listener: () => void, options: unknown) {
					expect(type).toBe('load');
					expect(options).toEqual({ once: true });
					start = listener;
				}
			}
		});
		if (readyState === 'loading') {
			expect(inserted).toHaveLength(0);
			start!();
		} else expect(start).toBeUndefined();
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(inserted).toHaveLength(1);
		expect(inserted[0]).toMatchObject({
			src: '/first.js',
			type: 'module',
			integrity: 'sha256-first',
			crossOrigin: 'use-credentials',
			nonce: 'nonce'
		});
		(inserted[0]!.onload as () => void)();
		await new Promise<void>((resolve) => setImmediate(resolve));
		expect(inserted).toHaveLength(2);
		expect(inserted[1]).toMatchObject({
			src: '/second.js',
			type: 'text/javascript',
			nonce: 'nonce'
		});
		(inserted[1]!.onload as () => void)();
	}
);

it('retains normal loading and security attributes without an inline loader', () => {
	const html = renderDocumentScripts(
		[{ src: '/app.js', integrity: 'sha256-value', crossOrigin: 'anonymous' }],
		'nonce'
	);
	expect(html).toContain('type="module"');
	expect(html).toContain('integrity="sha256-value"');
	expect(html).toContain('crossorigin="anonymous"');
	expect(html).not.toContain('addEventListener');
	expect(renderDocumentScripts([{ src: '/legacy.js', type: 'classic' }])).toContain(' defer');
	expect(renderAfterLoadBootstrap([])).toBe('');
});
