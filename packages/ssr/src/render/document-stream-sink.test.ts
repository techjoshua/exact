import { expect, it, vi } from 'vitest';
import { DocumentStreamSink } from './document-stream-sink.js';
import { SsrOutputLimitError } from './limits.js';

const head = '<!doctype html><html><head><title>Ready</title></head>';
const tail = '</body></html>';

it('publishes the head once and releases body output before completion', async () => {
	const chunks: string[] = [];
	const destination = {
		head: vi.fn((html: string) => {
			chunks.push(html);
		}),
		body: vi.fn((html: string) => {
			chunks.push(html);
		}),
		abort: vi.fn()
	};
	const sink = new DocumentStreamSink(4096, destination, 32);
	sink.write(head);
	await sink.flush('head');
	const first = '<body><p>' + 'first '.repeat(20) + '</p>';
	sink.write(first);
	await sink.ready();
	expect(chunks.join('')).toContain('first');
	sink.write('<p>last</p>' + tail);
	await sink.flush('head');
	const result = await sink.finish();
	expect(result).toEqual({ html: tail, streamed: true });
	expect(chunks.join('') + result.html).toBe(head + first + '<p>last</p>' + tail);
	expect(destination.head).toHaveBeenCalledOnce();
	expect(() => sink.write('later')).toThrow('closed');
});

it.each([1, 7, 32, 8192])(
	'preserves UTF-8 across span boundaries with threshold %s',
	async (size) => {
		const chunks: string[] = [];
		const destination = {
			head: (html: string) => {
				chunks.push(html);
			},
			body: (html: string) => {
				chunks.push(html);
			},
			abort: vi.fn()
		};
		const body = '<body>' + 'a\ud83d\ude80\u65e5'.repeat(30) + '\ud800' + tail;
		const sink = new DocumentStreamSink(4096, destination, size);
		sink.write(head);
		await sink.flush('head');
		for (const unit of body.split('')) {
			sink.write(unit);
			await sink.ready();
			await sink.flush('await');
		}
		const result = await sink.finish();
		chunks.push(result.html);
		const encoder = new TextEncoder();
		expect(Buffer.concat(chunks.map((chunk) => encoder.encode(chunk)))).toEqual(
			Buffer.from(head + body)
		);
	}
);

it('retains speculative output when no document head has committed', async () => {
	const publish = vi.fn();
	const sink = new DocumentStreamSink(1024, { head: publish, body: publish, abort: vi.fn() }, 1);
	sink.write('<main>Fragment</main>');
	await sink.ready();
	await sink.flush('await');
	expect(await sink.finish()).toEqual({ html: '<main>Fragment</main>', streamed: false });
	expect(publish).not.toHaveBeenCalled();
});

it('propagates transport pressure and aborts pending work on write failure', async () => {
	let reject!: (reason: unknown) => void;
	const pressure = new Promise<void>((_resolve, fail) => {
		reject = fail;
	});
	const abort = vi.fn();
	const sink = new DocumentStreamSink(4096, { head: () => {}, body: () => pressure, abort }, 32);
	sink.write(head);
	await sink.flush('head');
	sink.write('<body>' + 'x'.repeat(128));
	const pending = sink.ready();
	expect(pending).toBeInstanceOf(Promise);
	// A generated continuation flushes before awaiting this very drain. Starting another
	// publication would replace the stream's single demand waiter and deadlock the response.
	expect(sink.flush('await')).toBe(pending);
	expect(sink.ready()).toBe(pending);
	const error = new Error('disconnected');
	reject(error);
	await expect(pending).rejects.toBe(error);
	expect(abort).toHaveBeenCalledExactlyOnceWith(error);
	expect(() => sink.write('later')).toThrow('closed');
});

it('reuses head pressure before allowing body publication', async () => {
	let release!: () => void;
	const pressure = new Promise<void>((resolve) => {
		release = resolve;
	});
	const body = vi.fn();
	const sink = new DocumentStreamSink(4096, { head: () => pressure, body, abort() {} }, 1);
	sink.write(head);
	const pending = sink.flush('head');
	expect(sink.flush('await')).toBe(pending);
	expect(sink.ready()).toBe(pending);
	expect(body).not.toHaveBeenCalled();
	release();
	await pending;
	sink.write('<body>ready' + tail);
	await sink.finish();
	expect(body).toHaveBeenCalledExactlyOnceWith('<body>ready');
});

it('checks exact cumulative UTF-8 limits before publication', async () => {
	const abort = vi.fn();
	const body = vi.fn();
	const sink = new DocumentStreamSink(head.length + 90, { head: () => {}, body, abort }, 32);
	sink.write(head);
	await sink.flush('head');
	expect(() => {
		sink.write('\u65e5'.repeat(50) + tail);
		sink.ready();
	}).toThrow(SsrOutputLimitError);
	expect(abort).toHaveBeenCalledOnce();
	expect(body).not.toHaveBeenCalled();
});

it.each([0, -1, 1.5, Infinity, NaN])('rejects invalid buffer threshold %s', (size) => {
	expect(() => new DocumentStreamSink(1024, { head() {}, body() {}, abort() {} }, size)).toThrow(
		RangeError
	);
});
