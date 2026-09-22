import { expect, it, vi } from 'vitest';
import { bindRequestRenderScheduler } from '@exactjs/server/framework/render-scheduling';
import { renderToString } from './render-output.js';
import { renderToHydratableProgressiveHtmlStream } from './entrypoints.js';
import { createOperation } from '../test-support/native-operations.js';
import {
	BufferedSinkDocument,
	SinkDocument,
	resetSinkFixture,
	sinkFixtureDisposals
} from './program-sink.fixtures.test.js';

it('selects policy from the rendering API and preserves explicit overrides', async () => {
	const controller = new AbortController();
	const string = vi.fn(() => undefined);
	const stream = vi.fn(() => undefined);
	bindRequestRenderScheduler(controller.signal, Object.assign(string, { streaming: stream }));
	expect((await renderToString('ready', { signal: controller.signal })).html).toBe('ready');
	expect(string).toHaveBeenCalledTimes(1);
	const response = new Response(
		renderToHydratableProgressiveHtmlStream('ready', { signal: controller.signal })
	);
	expect(await response.text()).toContain('ready');
	expect(stream).toHaveBeenCalledTimes(1);
	const explicit = vi.fn(() => undefined);
	await renderToString('override', { signal: controller.signal, scheduleRender: explicit });
	expect(explicit).toHaveBeenCalledTimes(1);
	await new Response(
		renderToHydratableProgressiveHtmlStream('override', {
			signal: controller.signal,
			scheduleRender: explicit
		})
	).text();
	expect(explicit).toHaveBeenCalledTimes(2);
	expect(string).toHaveBeenCalledTimes(1);
	expect(stream).toHaveBeenCalledTimes(1);
	const fallback = vi.fn(() => undefined);
	bindRequestRenderScheduler(controller.signal, fallback);
	await new Response(
		renderToHydratableProgressiveHtmlStream('fallback', { signal: controller.signal })
	).text();
	expect(fallback).toHaveBeenCalledTimes(1);
});

it('consults the inherited policy once after a component task settles, preserving early head output', async () => {
	const settle = resetSinkFixture();
	const controller = new AbortController();
	let release!: () => void;
	const queue = new Promise<void>((resolve) => {
		release = resolve;
	});
	const checkpoint = vi.fn(() => (checkpoint.mock.calls.length === 1 ? undefined : queue));
	const defaultPolicy = vi.fn(() => undefined);
	bindRequestRenderScheduler(
		controller.signal,
		Object.assign(defaultPolicy, { streaming: checkpoint })
	);
	const reader = renderToHydratableProgressiveHtmlStream(createOperation(SinkDocument, {}), {
		signal: controller.signal
	}).getReader();
	try {
		expect(new TextDecoder().decode((await reader.read()).value)).toContain('</head>');
		expect(new TextDecoder().decode((await reader.read()).value)).toContain('Before');
		expect(checkpoint).toHaveBeenCalledTimes(1);
		settle();
		let resumed = false;
		const next = reader.read().then((value) => {
			resumed = true;
			return value;
		});
		await vi.waitFor(() => expect(checkpoint).toHaveBeenCalledTimes(2));
		expect(resumed).toBe(false);
		release();
		let html = new TextDecoder().decode((await next).value);
		for (;;) {
			const chunk = await reader.read();
			if (chunk.done) break;
			html += new TextDecoder().decode(chunk.value);
		}
		expect(html).toContain('Ready');
		expect(html).toContain('__exact_hydration');
		expect(html).toMatch(/<\/body><\/html>$/);
		expect(checkpoint).toHaveBeenCalledTimes(2);
		expect(defaultPolicy).not.toHaveBeenCalled();
		expect(sinkFixtureDisposals()).toBe(1);
	} finally {
		settle();
		release();
		await reader.cancel();
		reader.releaseLock();
	}
});

it('cancels queued component resumption and releases component ownership without waiting for the host queue', async () => {
	const settle = resetSinkFixture();
	const controller = new AbortController();
	let calls = 0;
	const checkpoint = vi.fn(() => (++calls === 1 ? undefined : new Promise<void>(() => {})));
	const pending = renderToString(createOperation(SinkDocument, {}), {
		signal: controller.signal,
		scheduleRender: checkpoint
	});
	const reason = new Error('disconnected');
	const failed = expect(pending).rejects.toBe(reason);
	try {
		settle();
		await vi.waitFor(() => expect(checkpoint).toHaveBeenCalledTimes(2));
		controller.abort(reason);
		await failed;
		expect(sinkFixtureDisposals()).toBe(1);
	} finally {
		settle();
		controller.abort(reason);
	}
});

it('retains an explicit immediate policy instead of the inherited host policy', async () => {
	const controller = new AbortController();
	const inherited = vi.fn(() => new Promise<void>(() => {}));
	bindRequestRenderScheduler(controller.signal, inherited);
	expect(
		(await renderToString('ready', { signal: controller.signal, scheduleRender: () => undefined }))
			.html
	).toBe('ready');
	expect(inherited).not.toHaveBeenCalled();
});

it('does not add checkpoints for synchronous components or sink backpressure', async () => {
	const checkpoint = vi.fn(() => undefined);
	const stream = renderToHydratableProgressiveHtmlStream(
		createOperation(BufferedSinkDocument, { content: 'large body '.repeat(8192) }),
		{ streamBufferSize: 32, scheduleRender: checkpoint }
	);
	expect(await new Response(stream).text()).toContain('</body></html>');
	expect(checkpoint).toHaveBeenCalledTimes(1);
});
