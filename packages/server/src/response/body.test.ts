import { describe, expect, it, vi } from 'vitest';
import {
	createExactAsyncProducedResponse,
	createExactBufferedResponse,
	createExactProducedResponse,
	exactResponseBodyOf
} from './body.js';

describe('buffered eXact response bodies', () => {
	it('exposes one body that can be forwarded without consuming it', async () => {
		const first = createExactBufferedResponse(200, {}, 'first');
		const second = createExactProducedResponse(201, {}, (write) => write('second'));
		expect({ ...first }.body).toBe(first.body);
		expect(first.body.toText()).toBe('first');
		expect(await new Response(second.body.toReadableStream()).text()).toBe('second');
		expect(() => first.body.toReadableStream()).toThrow('already claimed');
		await expect(second.body.writeTo(() => {})).rejects.toThrow('already claimed');
	});
	it('joins chunks only when a direct consumer reads body', () => {
		const response = createExactBufferedResponse(200, {}, ['<main>', 'rendered', '</main>']);

		expect(response.body.toText()).toBe('<main>rendered</main>');
		expect(response.body.toText()).toBe('<main>rendered</main>');
		expect(() => response.body.toReadableStream()).toThrow('already claimed');
	});

	it('materializes a reusable Web stream view only when requested', async () => {
		const response = createExactBufferedResponse(200, {}, 'rendered');
		const first = response.body.toReadableStream();

		expect(first).toBeDefined();
		expect(response.body.toReadableStream()).toBe(first);
		expect(await new Response(first).text()).toBe('rendered');
	});

	it('enforces one transport claim', async () => {
		const response = createExactBufferedResponse(200, {}, ['<main>', 'rendered', '</main>']);
		const chunks: string[] = [];

		await exactResponseBodyOf(response)?.writeTo((chunk) => {
			chunks.push(chunk);
		});

		expect(chunks).toEqual(['<main>', 'rendered', '</main>']);
		expect(() => response.body.toReadableStream()).toThrow('already claimed');
	});

	it('lets Fetch-native adapters encode buffered chunks without joining them', async () => {
		const response = createExactBufferedResponse(200, {}, ['<main>', 'rendered', '</main>']);
		const blob = exactResponseBodyOf(response)?.toBlob();

		expect(await blob?.text()).toBe('<main>rendered</main>');
		expect(() => response.body.toReadableStream()).toThrow('already claimed');
	});

	it('cancels without constructing the compatibility stream', async () => {
		const response = createExactBufferedResponse(200, {}, 'rendered');

		await exactResponseBodyOf(response)?.cancel('unused');

		expect(() => response.body.toReadableStream()).toThrow('already claimed');
	});
});

describe('produced eXact response bodies', () => {
	it('runs one synchronous producer only after an adapter claims it', async () => {
		const produce = vi.fn((write: (chunk: string) => void) => {
			write('<main>');
			write('ready');
			write('</main>');
		});
		const response = createExactProducedResponse(200, {}, produce);
		const chunks: string[] = [];

		expect(produce).not.toHaveBeenCalled();
		expect(exactResponseBodyOf(response)?.kind).toBe('synchronous');
		await exactResponseBodyOf(response)?.writeTo((chunk) => {
			chunks.push(chunk);
		});

		expect(chunks).toEqual(['<main>', 'ready', '</main>']);
		expect(produce).toHaveBeenCalledTimes(1);
		expect(() => response.body.toReadableStream()).toThrow('already claimed');
	});

	it('passes immutable environment capabilities only to a synchronous adapter claim', () => {
		const encodedByteLength = vi.fn((value: string) => value.length);
		const environment = Object.freeze({ encodedByteLength });
		const produce = vi.fn((_write, receivedEnvironment) => {
			expect(receivedEnvironment).toBe(environment);
			expect(receivedEnvironment?.encodedByteLength?.('ready')).toBe(5);
		});
		const response = createExactProducedResponse(200, {}, produce);

		exactResponseBodyOf(response)?.writeSynchronously?.(() => undefined, environment);

		expect(produce).toHaveBeenCalledOnce();
		expect(encodedByteLength).toHaveBeenCalledWith('ready');
	});

	it('releases a transferred request scope after publication', async () => {
		const release = vi.fn(async () => undefined);
		const response = createExactProducedResponse(200, {}, (write) => write('ready'));
		const body = exactResponseBodyOf(response)!;
		body.retainRequestScope?.(release);

		expect(release).not.toHaveBeenCalled();
		await body.writeTo(() => undefined);

		expect(release).toHaveBeenCalledWith('eXact produced response complete');
	});

	it('cancels an unclaimed producer and releases its request scope', async () => {
		const produce = vi.fn();
		const release = vi.fn(async () => undefined);
		const response = createExactProducedResponse(200, {}, produce);
		const body = exactResponseBodyOf(response)!;
		body.retainRequestScope?.(release);

		await body.cancel('client disconnected');

		expect(produce).not.toHaveBeenCalled();
		expect(release).toHaveBeenCalledWith('client disconnected');
	});
});

describe('asynchronous produced eXact response bodies', () => {
	it('awaits each adapter write before producing the next span', async () => {
		const events: string[] = [];
		const response = createExactAsyncProducedResponse(200, {}, async (write) => {
			events.push('produce:first');
			await write('first');
			events.push('produce:second');
			await write('second');
		});
		const body = exactResponseBodyOf(response)!;

		await body.writeTo(async (chunk) => {
			events.push(`write:${chunk}`);
			await Promise.resolve();
			events.push(`settled:${chunk}`);
		});

		expect(events).toEqual([
			'produce:first',
			'write:first',
			'settled:first',
			'produce:second',
			'write:second',
			'settled:second'
		]);
		expect('writeSynchronously' in body).toBe(false);
		expect('toText' in body).toBe(false);
		expect('toBlob' in body).toBe(false);
	});

	it('adapts asynchronous strings to a demand-driven UTF-8 stream', async () => {
		const response = createExactAsyncProducedResponse(200, {}, async (write) => {
			await write('ready ');
			await write('🚀');
		});

		expect(await new Response(response.body.toReadableStream()).text()).toBe('ready 🚀');
	});

	it('aborts a claimed producer and releases its request scope', async () => {
		const release = vi.fn(async () => undefined);
		const response = createExactAsyncProducedResponse(200, {}, async (_write, signal) => {
			await new Promise<void>((_resolve, reject) => {
				signal.addEventListener('abort', () => reject(signal.reason), { once: true });
			});
		});
		const body = exactResponseBodyOf(response)!;
		body.retainRequestScope?.(release);
		const writing = body.writeTo(() => undefined);

		await body.cancel('client disconnected');
		await expect(writing).rejects.toBe('client disconnected');
		expect(release).toHaveBeenCalledWith('client disconnected');
	});
});

it('bounds adapter prefetch and cancels a producer blocked on a full byte queue', async () => {
	let writes = 0;
	let signal: AbortSignal | undefined;
	let finished!: () => void;
	const complete = new Promise<void>((resolve) => {
		finished = resolve;
	});
	const response = createExactAsyncProducedResponse(200, {}, async (write, received) => {
		signal = received;
		try {
			for (let i = 0; i < 100; i++) {
				await write('12345678');
				writes++;
			}
		} finally {
			finished();
		}
	});
	const stream = response.body.toReadableStream({ highWaterMarkBytes: 16 });
	await new Promise((resolve) => setTimeout(resolve, 0));
	expect(writes).toBe(2);
	await stream.cancel('disconnect');
	await complete;
	expect(signal?.aborted).toBe(true);
	expect(writes).toBe(2);
});

it('wakes a demand-blocked producer when its retained request scope aborts', async () => {
	const controller = new AbortController();
	const release = vi.fn(async () => undefined);
	let finished!: () => void;
	const complete = new Promise<void>((resolve) => {
		finished = resolve;
	});
	const response = createExactAsyncProducedResponse(200, {}, async (write) => {
		try {
			await write('first');
			await write('second');
		} finally {
			finished();
		}
	});
	response.body.retainRequestScope?.(release, controller.signal);
	const reader = response.body.toReadableStream().getReader();
	expect((await reader.read()).done).toBe(false);
	controller.abort(new Error('request ended'));
	await complete;
	await expect(reader.read()).rejects.toThrow('request ended');
	expect(release).toHaveBeenCalledOnce();
	reader.releaseLock();
});

it('encodes split surrogate pairs and trailing unmatched surrogates consistently in every body stream', async () => {
	const chunks = ['start \ud83d', '\ude80 end \ud83d'];
	const responses = [
		createExactBufferedResponse(200, {}, chunks),
		createExactProducedResponse(200, {}, (write) => chunks.forEach(write)),
		createExactAsyncProducedResponse(200, {}, async (write) => {
			for (const chunk of chunks) await write(chunk);
		})
	];
	for (const response of responses)
		expect(await new Response(response.body.toReadableStream()).text()).toBe('start 🚀 end �');
});

it('cancels an unclaimed producer for bodyless HTTP statuses without leaking its request scope', async () => {
	const { exactResponseToFetchResponse } = await import('../adapters.js');
	for (const status of [204, 205, 304]) {
		const produce = vi.fn(async () => {}),
			release = vi.fn(async () => {});
		const response = createExactAsyncProducedResponse(status, {}, produce);
		response.body.retainRequestScope?.(release);
		const fetched = exactResponseToFetchResponse(response);
		expect(await fetched.text()).toBe('');
		expect(produce).not.toHaveBeenCalled();
		expect(release).toHaveBeenCalledOnce();
	}
});

it('preserves split surrogate pairs when buffered spans are consumed as a Blob', async () => {
	const response = createExactBufferedResponse(200, {}, ['start \ud83d', '\ude80 end \ud83d']);
	expect(await response.body.toBlob().text()).toBe('start 🚀 end �');
});

it.each(['writer', 'stream'] as const)(
	'keeps request resources until a cancelled %s producer unwinds',
	async (mode) => {
		const entered = completionGate();
		const unwound = completionGate();
		const release = vi.fn(async () => {});
		const response = createExactAsyncProducedResponse(200, {}, async (_write, signal) => {
			try {
				await new Promise<void>((resolve) => {
					signal.addEventListener('abort', () => resolve(), { once: true });
					entered.resolve();
				});
			} finally {
				await unwound.promise;
			}
		});
		response.body.retainRequestScope?.(release);
		const reader = mode === 'stream' ? response.body.toReadableStream().getReader() : undefined;
		const consuming = reader ? reader.read() : response.body.writeTo(() => {});
		await entered.promise;
		let settled = false;
		const cancellation = (
			reader ? reader.cancel('disconnect') : response.body.cancel('disconnect')
		).then(() => {
			settled = true;
		});
		try {
			await Promise.resolve();
			await Promise.resolve();
			expect(settled).toBe(false);
			expect(release).not.toHaveBeenCalled();
		} finally {
			unwound.resolve();
			await Promise.all([cancellation, consuming]);
		}
		expect(release).toHaveBeenCalledOnce();
	}
);

it('retains the scope when production synchronously aborts its request before returning a promise', async () => {
	const request = new AbortController();
	const gate = completionGate();
	const release = vi.fn(async () => {});
	const response = createExactAsyncProducedResponse(200, {}, async () => {
		request.abort('synchronous disconnect');
		await gate.promise;
	});
	response.body.retainRequestScope?.(release, request.signal);
	const writing = response.body.writeTo(() => {});
	try {
		await Promise.resolve();
		expect(release).not.toHaveBeenCalled();
	} finally {
		gate.resolve();
		await writing;
	}
	expect(release).toHaveBeenCalledOnce();
});

/** Holds producer cleanup open so cancellation assertions do not depend on timer races. */
function completionGate() {
	let resolve!: () => void;
	const promise = new Promise<void>((complete) => {
		resolve = complete;
	});
	return { promise, resolve };
}
