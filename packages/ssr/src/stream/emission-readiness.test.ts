import { expect, it } from 'vitest';
import { createProgressiveHtmlStream } from './creation.js';
import { produceProgressiveHtml } from './production.js';

it('completes a ready writer directly and retains actual writer pressure', async () => {
	const written: string[] = [];
	let release!: () => void;
	const pressure = new Promise<void>((resolve) => {
		release = resolve;
	});
	let blocked: void | Promise<void>;
	const rendering = produceProgressiveHtml(
		async (_options, emit) => {
			expect(emit({ event: 'head', version: 1, html: '<head></head>' })).toBeUndefined();
			blocked = emit({ event: 'shell', version: 1, html: '<main>Ready</main>' });
			expect(blocked).toBeInstanceOf(Promise);
			await blocked;
		},
		{},
		(chunk) => {
			written.push(chunk);
			if (written.length === 2) return pressure;
		},
		new AbortController().signal
	);
	try {
		expect(written).toEqual(['<head></head>', '<div id="exact-root"><main>Ready</main></div>']);
	} finally {
		release();
	}
	await rendering;
});

it('uses bounded queue space directly and waits only after it fills', async () => {
	const head = '<!doctype html><html><head></head>';
	const body = '<body>' + 'x'.repeat(26);
	let headPending: boolean | undefined;
	let firstBodyPending: boolean | undefined;
	let secondBodyPending: boolean | undefined;
	const stream = createProgressiveHtmlStream(
		async (_options, emit) => {
			await emit({ event: 'start', version: 1 });
			headPending = emit({ event: 'head', version: 1, html: head }) instanceof Promise;
			firstBodyPending = emit({ event: 'body', version: 1, html: body }) instanceof Promise;
			const pending = emit({ event: 'body', version: 1, html: '34' });
			secondBodyPending = pending instanceof Promise;
			await pending;
			await emit({ event: 'shell', version: 1, html: '</body></html>', streamed: true });
			await emit({ event: 'complete', version: 1 });
		},
		{ streamBufferSize: 8 }
	);
	const reader = stream.getReader();
	try {
		const first = await reader.read();
		expect(new TextDecoder().decode(first.value)).toBe(head);
		expect(headPending).toBe(false);
		expect(firstBodyPending).toBe(false);
		expect(secondBodyPending).toBe(true);
		let tail = '';
		for (;;) {
			const chunk = await reader.read();
			if (chunk.done) break;
			tail += new TextDecoder().decode(chunk.value);
		}
		expect(tail).toBe(body + '34</body></html>');
	} finally {
		await reader.cancel();
		reader.releaseLock();
	}
});

it.each([0, -1, 1.5, NaN, Infinity])(
	'rejects invalid queue capacity %s before starting a render',
	(streamBufferSize) => {
		expect(() =>
			createProgressiveHtmlStream(
				() => {
					throw new Error('must not render');
				},
				{ streamBufferSize }
			)
		).toThrow(RangeError);
	}
);
