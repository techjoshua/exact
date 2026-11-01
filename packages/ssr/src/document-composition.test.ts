import { appendFileSync } from 'node:fs';
import { createPreparedServerComponentInputReference } from '@exactjs/core/framework/server-render-structure';
import { renderToProgressiveHtmlStream } from './render/entrypoints.js';
import {
	CapturedChildInput,
	CapturedChildValue
} from './render/component-prop-values.fixtures.test.js';
import { createSsrContext } from './render/context.js';
import { prepareRootComponentInputExecution } from './render/root-props.js';
import { renderDocumentRootOutput } from './render/document-root-output.js';
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
import { createCompiledComponentInputReceipt } from '@exactjs/core/runtime/component-operations';
import { documentHydrationSlot } from './render/document-output.js';
describe('composed documents', () => {
	it('reclassifies document slots after an output extension replaces the markup', async () => {
		for (const operation of [
			element('main', null, 'Plain'),
			composeDocument(element('main', null, 'Composed'))
		]) {
			const options = {
				outputExtensions: [
					{
						transform(
							value: unknown,
							context: {
								kind: string;
							}
						) {
							return context.kind === 'html' ? `before${documentHydrationSlot}after` : value;
						}
					}
				]
			};
			const result = await renderToHydratableString(operation, options);
			expect(result.html).toBe('beforeafter');
			expect(result.htmlWithHydration).toBe(
				`before<!--exact:framework-body:start-->${result.hydrationScript}<!--exact:framework-body:end-->after`
			);
			expect((await renderToString(operation, options)).html).toBe('beforeafter');
		}
	});
	it('appends hydration when an output extension removes the original slot', async () => {
		const result = await renderToHydratableString(composeDocument(element('main', null, 'Body')), {
			outputExtensions: [
				{
					transform(value, context) {
						return context.kind === 'html' ? '<main>Replacement</main>' : value;
					}
				}
			]
		});
		expect(result.html).toBe('<main>Replacement</main>');
		expect(result.htmlWithHydration).toBe(`${result.html}${result.hydrationScript}`);
	});
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
			createCompiledComponentInputReceipt(PendingDocument, {}),
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
			createCompiledComponentInputReceipt(PartitionedDialog, {})
		);
		expect(result.html).toMatch(/<header[^>]*>.*<h1[^>]*>Heading<\/h1>.*<\/header>/);
		expect(result.html).toMatch(/<main[^>]*>.*<p[^>]*>Content<\/p>.*<\/main>/);
	});
	it('lets a replacement shell author its own doctype and output slots', async () => {
		const operation = createCompiledComponentInputReceipt(CustomDocument, {});
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
			const result = await renderToHydratableString(
				createCompiledComponentInputReceipt(Component, {})
			);
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

// Progressive document execution must consume the same occurrence that captured its inputs.
it.each(['reader', 'getter'] as const)(
	'acquires effective children once per progressive occurrence (%s)',
	async (kind) => {
		let reads = 0;
		const next = () =>
			createCompiledComponentInputReceipt(CapturedChildValue, { value: `child-${++reads}` });
		const operation =
			kind === 'reader'
				? createPreparedServerComponentInputReference(
						CapturedChildInput,
						{},
						{ kind: 'reader', read: () => [next()] }
					)
				: createPreparedServerComponentInputReference(CapturedChildInput, {
						get children() {
							return next();
						}
					});
		const outputs: string[] = [];
		for (let occurrence = 0; occurrence < 2; occurrence++) {
			outputs.push(
				await new Response(
					renderToProgressiveHtmlStream(operation, { markers: false, hydration: false })
				).text()
			);
		}
		if (process.env.EXACT_CHILD_INPUT_OBSERVATIONS)
			appendFileSync(
				process.env.EXACT_CHILD_INPUT_OBSERVATIONS,
				JSON.stringify({ case: kind, reads, outputs }) + '\n'
			);
		expect(reads).toBe(2);
		expect(outputs[0]).toContain('<i>child-1</i>');
		expect(outputs[1]).toContain('<i>child-2</i>');
	}
);
it('claims the prepared root input record before progressive construction', async () => {
	let reads = 0;
	const operation = createPreparedServerComponentInputReference(
		CapturedChildInput,
		{},
		{
			kind: 'reader',
			read() {
				reads++;
				return ['captured'];
			}
		}
	);
	const context = createSsrContext({ markers: false });
	context.rootComponentInputs = prepareRootComponentInputExecution(operation);
	const html = await renderDocumentRootOutput(context, operation, { markers: false });
	if (process.env.EXACT_CHILD_INPUT_OBSERVATIONS)
		appendFileSync(
			process.env.EXACT_CHILD_INPUT_OBSERVATIONS,
			JSON.stringify({
				case: 'prepared-root',
				reads,
				claimed: context.rootComponentInputs === undefined,
				html,
				depth: context.traversalDepth
			}) + '\n'
		);
	expect(reads).toBe(1);
	expect(context.rootComponentInputs).toBeUndefined();
	expect(html).toContain('captured</section>');
	expect(context.traversalDepth).toBe(0);
});
it('preserves acquisition failure and releases the progressive traversal frame', async () => {
	const failure = new Error('progressive child acquisition');
	let reads = 0,
		caught: unknown;
	const operation = createPreparedServerComponentInputReference(
		CapturedChildInput,
		{},
		{
			kind: 'reader',
			read() {
				reads++;
				throw failure;
			}
		}
	);
	const context = createSsrContext({ markers: false });
	try {
		await renderDocumentRootOutput(context, operation, { markers: false });
	} catch (error) {
		caught = error;
	}
	if (process.env.EXACT_CHILD_INPUT_OBSERVATIONS)
		appendFileSync(
			process.env.EXACT_CHILD_INPUT_OBSERVATIONS,
			JSON.stringify({
				case: 'acquisition-failure',
				reads,
				exactPrimary: caught === failure,
				depth: context.traversalDepth,
				componentDepth: context.enhancementOperationComponentDepth
			}) + '\n'
		);
	expect(caught).toBe(failure);
	expect(reads).toBe(1);
	expect(context.traversalDepth).toBe(0);
	expect(context.enhancementOperationComponentDepth).toBe(0);
});
