import { expect, it } from 'vitest';
import { DocumentStringSink } from './document-string-sink.js';
import { SsrOutputLimitError } from './limits.js';
import { createChunkedHydratableResult, createChunkedStringResult } from './output-result.js';
import {
	createPreparedServerRenderProgram,
	prepareCompiledRenderProgram
} from '@exactjs/core/framework/server-render-structure';
import { createSsrContext } from './context.js';
import { renderPreparedSsrProgram } from './render-program.js';
import { enterHostTag, leaveHost } from './host.js';

it.each([undefined, 8])('preserves normalized output with optional body offset %s', (offset) => {
	const context = createSsrContext({});
	const sink = new DocumentStringSink(1_000);
	context.writerSink = sink;
	const host = enterHostTag(context, 'html');
	sink.write(host.prefix);
	sink.captureDocumentBoundary();
	sink.write('<html><head></head>');
	const program = createPreparedServerRenderProgram(
		prepareCompiledRenderProgram({
			version: 1,
			id: 'body-boundary',
			namespace: 'html',
			ssrHost: 'body',
			ssr(operations, _context, _invocation, output) {
				operations.static(output, '<body><main>');
				operations.static(output, '日</main></body>', offset);
				return output;
			}
		}),
		[]
	);
	expect(renderPreparedSsrProgram(context, program, () => '')).toBe('');
	leaveHost(context, host.tag);
	sink.write('</html>');
	const chunks = sink.finishChunks();
	const result = createChunkedHydratableResult(
		createChunkedStringResult(chunks, undefined),
		undefined,
		'<script>state</script>'
	);
	expect(result.htmlWithHydration).toBe(
		'<!doctype html><html><head></head><body><main>日</main><!--exact:framework-body:start--><script>state</script><!--exact:framework-body:end--></body></html>'
	);
	if (offset !== undefined) expect(chunks.at(-1)).toBe('</body></html>');
});

it('preserves document insertion boundaries and lazy hydration output', () => {
	const sink = new DocumentStringSink(1_000);
	sink.write('<!doctype html>');
	sink.captureDocumentBoundary();
	sink.write('<html><head></head><body>');
	sink.write('content');
	sink.captureDocumentBoundary();
	sink.write('</body></html>');
	const chunks = sink.finishChunks();
	expect(chunks).toEqual(['<!doctype html>', '<html><head></head><body>content', '</body></html>']);
	const plain = createChunkedStringResult(chunks, undefined);
	const hydrated = createChunkedHydratableResult(plain, undefined, '<script>state</script>');
	expect(hydrated.html).toBe(chunks.join(''));
	expect(hydrated.htmlWithHydration).toBe(
		'<!doctype html><html><head></head><body>content<!--exact:framework-body:start--><script>state</script><!--exact:framework-body:end--></body></html>'
	);
	expect(hydrated.htmlWithHydration).toBe(hydrated.htmlWithHydration);
	sink.destroy();
	expect(() => sink.write('late')).toThrow(/closed/);
});

it.each([
	{ parts: ['ab', 'cd'], prefix: [], bytes: 4 },
	{ parts: ['日', '本'], prefix: ['語'], bytes: 9 },
	{ parts: ['\ud83d', '\ude80'], prefix: [], bytes: 4 },
	{ parts: ['\ud83d'], prefix: [], bytes: 3 },
	{ parts: ['\ude80'], prefix: ['\ud83d'], bytes: 4 }
])(
	'checks combined UTF-8 output across retained boundaries: $parts',
	({ parts, prefix, bytes }) => {
		for (const maximum of [bytes - 1, bytes, bytes + 1]) {
			const sink = new DocumentStringSink(maximum);
			const render = () => {
				for (const part of parts) {
					sink.write(part);
					sink.captureDocumentBoundary();
				}
				return sink.finishChunks(prefix).join('');
			};
			if (maximum < bytes) expect(render).toThrow(SsrOutputLimitError);
			else expect(render()).toBe(prefix.join('') + parts.join(''));
			expect(() => sink.captureDocumentBoundary()).toThrow(/closed/);
			expect(() => sink.finishChunks()).toThrow(/closed/);
		}
	}
);

it('enforces the original limit across boundaries and rejects canceled output', () => {
	const sink = new DocumentStringSink(5);
	sink.write('abcd');
	sink.captureDocumentBoundary();
	expect(() => sink.write('ef')).toThrow(new SsrOutputLimitError(5));
	expect(() => sink.finishChunks()).toThrow(/closed/);
	const canceled = new DocumentStringSink(100);
	canceled.write('retained');
	canceled.captureDocumentBoundary();
	canceled.destroy();
	canceled.destroy();
	expect(() => canceled.finishChunks()).toThrow(/closed/);
});
