import { describe, expect, it } from 'vitest';
import { composeDocument } from '../../core/src/document/composition.js';
import { createCompiledIntrinsicReceipt as element } from '@exactjs/core/runtime/component-operations';
import { renderToHydratableString, renderToString } from './render/render-output.js';
import { renderToHydratableProgressiveHtmlStream } from './render/entrypoints.js';
import {
	ComposedDocument,
	PartitionedDialog,
	PendingDocument,
	gateComposedBody,
	MinimalDocument,
	CustomDocument
} from './document-composition.fixtures.test.js';
import { doctype, documentOutput } from '@exactjs/core/document';
import { createCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';

describe('composed documents', () => {
	it('rejects misplaced and duplicate output slots', async () => {
		await expect(renderToString(element('main', null, documentOutput.styles))).rejects.toThrow(
			/immediate head/
		);
		const duplicate = element(
			'html',
			null,
			element('head', null, documentOutput.styles, documentOutput.styles),
			element('body', null)
		);
		await expect(renderToString(duplicate)).rejects.toThrow(/Duplicate/);
		const reversed = element(
			'html',
			null,
			element('head', null),
			element('body', null, documentOutput.bootstrap, documentOutput.hydrationData)
		);
		await expect(renderToString(reversed)).rejects.toThrow(/must follow/);
	});
	it('keeps deferred publication markers out of public plain HTML', async () => {
		const operation = composeDocument(element('main', null, 'Plain'));
		expect((await renderToString(operation)).html).not.toContain('exact:document-hydration');
		expect((await renderToHydratableString(operation)).html).not.toContain(
			'exact:document-hydration'
		);
	});
	it('publishes the completed head before a pending body settles', async () => {
		const release = gateComposedBody();
		const reader = renderToHydratableProgressiveHtmlStream(
			createCompiledComponentReceipt(PendingDocument, {}),
			{ streamBufferSize: 1 }
		).getReader();
		try {
			const first = new TextDecoder().decode((await reader.read()).value);
			expect(first).toMatch(/^<!doctype html>/);
			expect(first).toContain('Early head</title>');
			expect(first).toContain('</head>');
			expect(first).not.toContain('Ready body');
			release();
			let html = first;
			for (;;) {
				const next = await reader.read();
				if (next.done) break;
				html += new TextDecoder().decode(next.value);
			}
			expect(html).toContain('Ready body');
			expect(html).not.toContain('exact:document-hydration');
			expect(html).toMatch(/<\/body><\/html>$/);
		} finally {
			release();
			await reader.cancel();
			reader.releaseLock();
		}
	});
	it('partitions compiled component children by identity', async () => {
		const result = await renderToHydratableString(
			createCompiledComponentReceipt(PartitionedDialog, {})
		);
		expect(result.html).toMatch(/<header[^>]*>.*<h1[^>]*>Heading<\/h1>.*<\/header>/);
		expect(result.html).toMatch(/<main[^>]*>.*<p[^>]*>Content<\/p>.*<\/main>/);
	});
	it('lets a replacement shell author its own doctype and output slots', async () => {
		const operation = createCompiledComponentReceipt(CustomDocument, {});
		const options = { documentAssets: { bootstrap: [{ src: '/custom.js' }] }, streamBufferSize: 1 };
		const result = await renderToHydratableString(operation, options);
		const streamed = await new Response(
			renderToHydratableProgressiveHtmlStream(operation, options)
		).text();
		for (const html of [result.htmlWithHydration, streamed]) {
			expect(html).toMatch(/^<!doctype html SYSTEM "about:legacy-compat"><html[ >]/);
			expect(html.match(/<!doctype /g)).toHaveLength(1);
			expect(html.indexOf('__exact_hydration')).toBeLessThan(html.indexOf('/custom.js'));
		}
	});
	it('validates declaration syntax and supports an override on the default shell', async () => {
		expect(() => doctype({ name: 'html><script>' })).toThrow(/name/);
		expect(() => doctype({ systemId: '" onload="bad' })).toThrow(/identifier/);
		expect(() => doctype({ publicId: 'example' })).toThrow(/system/);
		const result = await renderToHydratableString(
			composeDocument([], { systemId: 'about:legacy-compat' })
		);
		expect(result.htmlWithHydration).toMatch(/^<!doctype html SYSTEM "about:legacy-compat">/);
	});
	it.each([ComposedDocument, MinimalDocument])(
		'renders compiler-authored document composition',
		async (Component) => {
			const result = await renderToHydratableString(createCompiledComponentReceipt(Component, {}));
			expect(result.htmlWithHydration).toMatch(/^<!doctype html>/);
			expect(result.htmlWithHydration.match(/<html[ >]/g)).toHaveLength(1);
			expect(result.htmlWithHydration.match(/<head[ >]/g)).toHaveLength(1);
			expect(result.htmlWithHydration.match(/<body[ >]/g)).toHaveLength(1);
			if (Component === ComposedDocument) {
				expect(result.htmlWithHydration).toContain('Composed title');
				expect(result.htmlWithHydration).toContain('lang="fr"');
			}
		}
	);
	it('supplies missing structure and keeps exactly one leading doctype', async () => {
		const result = await renderToHydratableString(composeDocument(element('main', null, 'Hello')));
		expect(result.htmlWithHydration).toMatch(/^<!doctype html><html lang="en"><head>/);
		expect(result.htmlWithHydration.match(/<!doctype html>/g)).toHaveLength(1);
		expect(result.htmlWithHydration).toContain('<title>eXact application</title>');
		expect(result.htmlWithHydration).toContain('<body><main>Hello</main>');
		expect(result.htmlWithHydration).toMatch(/<\/body><\/html>$/);
		expect(result.htmlWithHydration).not.toContain('exact:document-hydration');
	});

	it('preserves supplied attributes and head ordering, and fills the framework slots once', async () => {
		const operation = composeDocument(
			element(
				'html',
				{ lang: 'fr', 'data-app': 'test' },
				element(
					'head',
					null,
					element('meta', { charSet: 'utf-8' }),
					element('title', null, 'Bonjour')
				),
				element('body', { className: 'dark' }, element('main', null, 'Body'))
			)
		);
		const result = await renderToHydratableString(operation, {
			state: { value: '$& $$ </script>' },
			documentAssets: {
				styles: ['/app.css'],
				headScripts: [{ src: '/head.js' }],
				bootstrap: [{ src: '/app.js' }],
				nonce: 'test'
			}
		});
		const html = result.htmlWithHydration;
		expect(html).toContain('$& $$');
		expect(html).not.toContain('exact:document-hydration');
		expect(html).toContain('<html lang="fr" data-app="test">');
		expect(html).toContain('<body class="dark">');
		expect(html.match(/charset=/gi)).toHaveLength(1);
		expect(html.match(/__exact_hydration/g)).toHaveLength(1);
		expect(html.indexOf('/app.css')).toBeLessThan(html.indexOf('</head>'));
		expect(html.indexOf('/head.js')).toBeLessThan(html.indexOf('</head>'));
		expect(html.indexOf('__exact_hydration')).toBeLessThan(html.indexOf('/app.js'));
		expect(html).toContain('nonce="test"');
	});

	it('uses request-local assets when one document operation is reused concurrently', async () => {
		const document = composeDocument(element('main', null, 'Shared'));
		const results = await Promise.all(
			['one', 'two'].map((name) =>
				renderToHydratableString(document, {
					state: { name },
					documentAssets: { styles: [`/${name}.css`] }
				})
			)
		);
		expect(results[0]!.htmlWithHydration).toContain('/one.css');
		expect(results[0]!.htmlWithHydration).not.toContain('/two.css');
		expect(results[1]!.htmlWithHydration).toContain('/two.css');
	});

	it('keeps hydration before bootstrap in progressive documents with one doctype', async () => {
		const operation = composeDocument(element('main', null, 'Streaming'));
		const stream = renderToHydratableProgressiveHtmlStream(operation, {
			documentAssets: { bootstrap: [{ src: '/app.js' }] },
			streamBufferSize: 1
		});
		const html = await new Response(stream).text();
		expect(html.match(/<!doctype html>/g)).toHaveLength(1);
		expect(html).not.toContain('exact:document-hydration');
		expect(html.indexOf('__exact_hydration')).toBeGreaterThan(0);
		expect(html.indexOf('__exact_hydration')).toBeLessThan(html.indexOf('/app.js'));
		expect(html).toMatch(/<\/body><\/html>$/);
	});

	it('rejects ambiguous document roots without evaluating application children', () => {
		expect(() => composeDocument([element('html', null), element('main', null)])).toThrow(
			/sibling/
		);
		expect(() => composeDocument([element('head', null), element('head', null)])).toThrow(
			/at most one/
		);
	});
});
