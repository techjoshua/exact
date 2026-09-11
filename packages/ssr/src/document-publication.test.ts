import { expect, it } from 'vitest';
import { augmentDocumentBody } from './document.js';
import {
	configureDocumentOptions,
	ExactDocument,
	SettlingFullDocument
} from './documents-security.fixtures.test.js';
import { renderToHydratableProgressiveHtmlStream } from './index.js';
import { createProgressiveHtmlStream } from './stream/creation.js';
import { produceProgressiveHtml } from './stream/production.js';
import { progressiveHtmlChunk, type ProgressiveDocumentState } from './stream/protocol.js';
import { deferred } from './test-support/deferred.js';
import { createOperation } from './test-support/native-operations.js';

const shell =
	'<!doctype html><html><head><link rel="stylesheet" href="/app.css"></head><body><main>Ready</main></body></html>';
const hydration = '<script type="application/json" id="state">{}</script>';

it.each(['</body></html>', '</BODY></HTML>', '</body>\n</html>\n'])(
	'preserves document-tail bytes and insertion position for %s',
	(tail) => {
		const prefix = '<!doctype html><html><head></head><body><main>caf\u00e9</main>';
		const document = prefix + tail;
		const state: ProgressiveDocumentState = {};
		expect(progressiveHtmlChunk({ event: 'shell', version: 1, html: document }, {}, state)).toBe(
			prefix
		);
		progressiveHtmlChunk({ event: 'hydration', version: 1, html: hydration }, {}, state);
		const expected =
			prefix +
			'<!--exact:framework-body:start-->' +
			hydration +
			'<!--exact:framework-body:end-->' +
			tail;
		expect(prefix + progressiveHtmlChunk({ event: 'complete', version: 1 }, {}, state)).toBe(
			expected
		);
		expect(augmentDocumentBody(document, hydration)).toBe(expected);
	}
);

it('rejects a normalized document without its closing body in both publication paths', () => {
	const document = '<!doctype html><html><body><main>Incomplete</main></html>';
	const message = 'missing its closing </body>';
	expect(() => augmentDocumentBody(document, hydration)).toThrow(message);
	expect(() =>
		progressiveHtmlChunk({ event: 'shell', version: 1, html: document }, {}, {})
	).toThrow(message);
});

it.each([true, false])('preserves the complete document with hydration=%s', (includeHydration) => {
	const state: ProgressiveDocumentState = {};
	const first = progressiveHtmlChunk({ event: 'shell', version: 1, html: shell }, {}, state);
	expect(first).toContain('</head><body><main>Ready</main>');
	expect(first).not.toContain('</body>');
	const middle = includeHydration
		? progressiveHtmlChunk({ event: 'hydration', version: 1, html: hydration }, {}, state)
		: '';
	const last = progressiveHtmlChunk({ event: 'complete', version: 1 }, {}, state);
	expect(first + middle + last).toBe(augmentDocumentBody(shell, includeHydration ? hydration : ''));
});

it('delivers shell bytes while hydration production is blocked', async () => {
	const ready = deferred<void>();
	const reader = createProgressiveHtmlStream(async (_options, emit) => {
		await emit({ event: 'shell', version: 1, html: shell });
		await ready.promise;
		await emit({ event: 'hydration', version: 1, html: hydration });
		await emit({ event: 'complete', version: 1 });
	}, {}).getReader();
	try {
		const first = new TextDecoder().decode((await reader.read()).value);
		expect(first).toContain('href="/app.css"');
		expect(first).not.toContain('id="state"');
		ready.resolve();
		const rest = new TextDecoder().decode((await reader.read()).value);
		expect(first + rest).toBe(augmentDocumentBody(shell, hydration));
		expect((await reader.read()).done).toBe(true);
	} finally {
		ready.resolve();
		await reader.cancel();
	}
});

it('hands the shell to response writers before constructing hydration', async () => {
	const chunks: string[] = [];
	await produceProgressiveHtml(
		async (_options, emit) => {
			await emit({ event: 'shell', version: 1, html: shell });
			expect(chunks.join('')).toContain('href="/app.css"');
			await emit({ event: 'hydration', version: 1, html: hydration });
			await emit({ event: 'complete', version: 1 });
		},
		{},
		(chunk) => {
			chunks.push(chunk);
		},
		new AbortController().signal
	);
	expect(chunks.join('')).toBe(augmentDocumentBody(shell, hydration));
});

it('publishes a compiler-rendered document before its hydration payload', async () => {
	const reader = renderToHydratableProgressiveHtmlStream(
		createOperation(ExactDocument, null)
	).getReader();
	try {
		let document = '';
		while (!document.includes('<main>ready</main>')) {
			const chunk = await reader.read();
			expect(chunk.done).toBe(false);
			document += new TextDecoder().decode(chunk.value);
			expect(document).not.toContain('<!--exact:framework-body:start-->');
			expect(document).not.toContain('</body>');
		}
		expect(document).toContain('<title>Exact</title>');
	} finally {
		await reader.cancel();
	}
});

it('settles a mutable document head before irreversible shell publication', async () => {
	const ready = deferred<void>();
	configureDocumentOptions(ready.promise);
	const reader = renderToHydratableProgressiveHtmlStream(
		createOperation(SettlingFullDocument, null)
	).getReader();
	let published = false;
	const first = reader.read().then((result) => {
		published = true;
		return result;
	});
	try {
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(published).toBe(false);
		ready.resolve();
		const html = new TextDecoder().decode((await first).value);
		expect(html).toContain('Settled');
		expect(html).not.toContain('Waiting');
		expect(html).not.toContain('</body>');
	} finally {
		ready.resolve();
		configureDocumentOptions(Promise.resolve());
		await reader.cancel();
	}
});

it('cancels a document producer blocked by response backpressure', async () => {
	const cleaned = deferred<void>();
	let signal: AbortSignal | undefined;
	const reader = createProgressiveHtmlStream(async (options, emit) => {
		signal = options.signal;
		try {
			await emit({ event: 'shell', version: 1, html: shell });
			await emit({ event: 'hydration', version: 1, html: hydration });
			await emit({ event: 'complete', version: 1 });
		} finally {
			cleaned.resolve();
		}
	}, {}).getReader();
	await reader.read();
	await reader.cancel('disconnected');
	await cleaned.promise;
	expect(signal?.aborted).toBe(true);
	expect(signal?.reason).toBe('disconnected');
});
