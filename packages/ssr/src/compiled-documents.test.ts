import { describe, expect, it } from 'vitest';
import {
	renderToString,
	renderToHydratableString,
	renderToHydratableProgressiveHtmlStream
} from './index.js';
import { createOperation } from './test-support/native-operations.js';
import {
	BodyOnlyDocument,
	LooseDocument,
	ReorderedDocument,
	AmbiguousDocument,
	DuplicateHeadDocument,
	NestedDocument,
	AssetDocument,
	LiteralUrlDocument,
	LiteralUrlSpread,
	LiteralScriptDocument
} from './compiled-documents.fixtures.test.js';

describe('compiled document components', () => {
	it('preserves static script identity, ordering, escaping, and dynamic URL validation', async () => {
		const props = { src: 'javascript:alert(4)' };
		const string = (await renderToString(createOperation(LiteralScriptDocument, props))).html;
		const stream = await new Response(
			renderToHydratableProgressiveHtmlStream(createOperation(LiteralScriptDocument, props))
		).text();
		for (const html of [string, stream]) {
			const scripts = html.match(/<script[^>]*src="[^"]*"[^>]*><\/script>/g);
			expect(scripts).toHaveLength(3);
			expect(scripts?.[0]).toContain('src="/app.js?first=1&amp;second=2"');
			expect(scripts?.[1]).toContain('eXact has blocked a javascript: URL');
			expect(scripts?.[2]).toContain('src="https://example.test/tail.js"');
			for (const script of scripts ?? []) expect(script).toContain('data-exact-id="');
			expect(html.indexOf('/app.js')).toBeLessThan(html.indexOf('</head>'));
			expect(html.indexOf('tail.js')).toBeGreaterThan(html.indexOf('</main>'));
			expect(html).not.toContain('alert(4)');
		}
	});
	it('distinguishes an absent spread property from an explicit undefined override', async () => {
		const absent = (await renderToString(createOperation(LiteralUrlSpread, {}))).html;
		const cleared = (await renderToString(createOperation(LiteralUrlSpread, { href: undefined })))
			.html;
		expect(absent.match(/href="[^"]*"/g)).toEqual(['href="/fallback"', 'href="/fixed"']);
		expect(cleared.match(/href="[^"]*"/g)).toEqual(['href="/fixed"']);
	});
	it.each(['/replacement', 'javascript:alert(3)'])(
		'preserves URL spread precedence and validates the final value: %s',
		async (href) => {
			const { html } = await renderToString(createOperation(LiteralUrlSpread, { href }));
			const attributes = html.match(/href="[^"]*"/g);
			expect(attributes).toHaveLength(2);
			expect(attributes?.[1]).toBe('href="/fixed"');
			expect(attributes?.[0]).toContain(
				href === '/replacement' ? '/replacement' : 'eXact has blocked a javascript: URL'
			);
			expect(html).not.toContain('href="/fallback"');
			expect(html).not.toContain('alert(3)');
		}
	);
	it('preserves literal URL escaping and rejects unsafe dynamic and literal URLs in both modes', async () => {
		const props = { href: ' \tj\na\tv\ra\ns\tc\rr\ni\tp\tt:alert(2)' };
		const string = (await renderToHydratableString(createOperation(LiteralUrlDocument, props)))
			.htmlWithHydration;
		const stream = await new Response(
			renderToHydratableProgressiveHtmlStream(createOperation(LiteralUrlDocument, props))
		).text();
		for (const html of [string, stream]) {
			expect(html).toContain('href="/app.css"');
			expect(html).toContain('href="/guide?first=1&amp;second=2"');
			expect(html).toContain('src="https://example.test/icon.svg"');
			expect(html.match(/eXact has blocked a javascript: URL/g)).toHaveLength(2);
			expect(html).not.toContain('alert(1)');
			expect(html).not.toContain('alert(2)');
		}
	});
	it.each([BodyOnlyDocument, LooseDocument])(
		'normalizes missing document hosts around compiled contents',
		async (component) => {
			const { html } = await renderToString(createOperation(component, null), { markers: false });
			expect(html).toMatch(/^<!doctype html><html[^>]*><head[^>]*><\/head><body[^>]*><main/);
			expect(html).toMatch(/<\/main><\/body><\/html>$/);
		}
	);
	it('orders an authored head before its body through runtime normalization', async () => {
		const { html } = await renderToString(createOperation(ReorderedDocument, null), {
			markers: false
		});
		expect(html.indexOf('<head')).toBeLessThan(html.indexOf('<body'));
		expect(html).toContain('<title>Reordered</title>');
	});
	it.each([
		[AmbiguousDocument, /ambiguous loose content/],
		[DuplicateHeadDocument, /at most one <head>/],
		[NestedDocument, /nested or duplicate/]
	] as const)('rejects invalid document composition', async (component, error) => {
		await expect(renderToString(createOperation(component, null))).rejects.toThrow(error);
	});
	it.each([[], ['/one.js', '/two.js']])(
		'preserves dynamic metadata and resources in both output modes',
		async (...sources: string[]) => {
			const props = { title: 'Café 🚀 <safe>', sources };
			const operation = createOperation(AssetDocument, props);
			const string = (await renderToHydratableString(operation, { publishRootProps: true }))
				.htmlWithHydration;
			const stream = await new Response(
				renderToHydratableProgressiveHtmlStream(createOperation(AssetDocument, props), {
					publishRootProps: true
				})
			).text();
			for (const html of [string, stream]) {
				expect(html).toMatch(/^<!doctype html>/);
				expect(html).toContain('Café 🚀 &lt;safe&gt;');
				expect(html).toContain('href="/app.css"');
				for (const src of sources) expect(html).toContain(`src="${src}"`);
				expect(html).toMatch(/<\/body><\/html>$/);
			}
		}
	);
});
