import { expect, it, vi } from 'vitest';
import { setTimeout, clearTimeout, setImmediate } from 'node:timers';
import { renderToHydratableProgressiveHtmlStream } from '../render/entrypoints.js';
import { createOperation } from '../test-support/native-operations.js';
import {
	BufferedSinkDocument,
	SinkDocument,
	resetSinkFixture,
	sinkFixtureDisposals,
	sinkFixtureStarts
} from '../render/program-sink.fixtures.test.js';

it('completes a body that crosses the configured buffer threshold under reader pressure', async () => {
	const content = 'Body content '.repeat(2048);
	const stream = renderToHydratableProgressiveHtmlStream(
		createOperation(BufferedSinkDocument, { content }),
		{ streamBufferSize: 32 }
	);
	const html = await new Response(stream).text();
	expect(html).toContain(content);
	expect(html.match(/<head\b/g)).toHaveLength(1);
	expect(html).toContain('__exact_hydration');
	expect(html).toMatch(/<\/body><\/html>$/);
});

it.each([false, true])(
	'delivers the head before a body task settles (scheduled=%s)',
	async (scheduled) => {
		const settle = resetSinkFixture();
		const reader = renderToHydratableProgressiveHtmlStream(createOperation(SinkDocument, {}), {
			scheduleRender: scheduled
				? () => new Promise<void>((resolve) => setImmediate(resolve))
				: undefined
		}).getReader();
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const first = await Promise.race([
				reader.read(),
				new Promise<undefined>((resolve) => {
					timer = setTimeout(() => resolve(undefined), 1000);
				})
			]);
			expect(first, 'the head must arrive while the body task is still pending').toBeDefined();
			const html = new TextDecoder().decode(first?.value);
			expect(html).toContain('</head>');
			expect(html).toContain('/app.css');
			expect(html).not.toContain('Ready');
			expect(html).not.toContain('</body>');
			const body = await Promise.race([
				reader.read(),
				new Promise<undefined>((resolve) => {
					if (timer) clearTimeout(timer);
					timer = setTimeout(() => resolve(undefined), 1000);
				})
			]);
			expect(body, 'body content must arrive before its later task settles').toBeDefined();
			expect(new TextDecoder().decode(body?.value)).toContain('<p>Before</p>');
			settle();
			let tail = '';
			for (;;) {
				const chunk = await reader.read();
				if (chunk.done) break;
				tail += new TextDecoder().decode(chunk.value);
			}
			expect(tail).toContain('Ready');
			expect(tail).toContain('__exact_hydration');
			expect(tail).toMatch(/<\/body><\/html>$/);
			expect(sinkFixtureDisposals()).toBe(1);
		} finally {
			if (timer) clearTimeout(timer);
			settle();
			await reader.cancel();
			reader.releaseLock();
		}
	}
);

it('cancels pending body work and releases ownership after the head was delivered', async () => {
	const settle = resetSinkFixture();
	const reader = renderToHydratableProgressiveHtmlStream(
		createOperation(SinkDocument, {})
	).getReader();
	try {
		expect(new TextDecoder().decode((await reader.read()).value)).toContain('</head>');
		await vi.waitFor(() => expect(sinkFixtureStarts()).toBe(1));
		await reader.cancel(new Error('consumer disconnected'));
		await vi.waitFor(() => expect(sinkFixtureDisposals()).toBe(1));
	} finally {
		settle();
		await reader.cancel();
		reader.releaseLock();
	}
});
