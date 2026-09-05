import { describe, expect, it, vi } from 'vitest';
import {
	createExactAsyncProducedResponse,
	createExactBufferedResponse,
	createExactProducedResponse,
	exactResponseBodyOf
} from './response-body.js';

describe('buffered eXact response bodies', () => {
	it('joins chunks only when a direct consumer reads body', () => {
		const response = createExactBufferedResponse(200, {}, ['<main>', 'rendered', '</main>']);

		expect(response.body).toBe('<main>rendered</main>');
		expect(response.body).toBe('<main>rendered</main>');
		expect(() => response.stream).toThrow('already claimed');
	});

	it('materializes a reusable Web stream view only when requested', async () => {
		const response = createExactBufferedResponse(200, {}, 'rendered');
		const first = response.stream;

		expect(first).toBeDefined();
		expect(response.stream).toBe(first);
		expect(await new Response(first).text()).toBe('rendered');
	});

	it('enforces one transport claim', async () => {
		const response = createExactBufferedResponse(200, {}, ['<main>', 'rendered', '</main>']);
		const chunks: string[] = [];

		await exactResponseBodyOf(response)?.writeTo((chunk) => {
			chunks.push(chunk);
		});

		expect(chunks).toEqual(['<main>', 'rendered', '</main>']);
		expect(() => response.stream).toThrow('already claimed');
	});

	it('lets Fetch-native adapters encode buffered chunks without joining them', async () => {
		const response = createExactBufferedResponse(200, {}, ['<main>', 'rendered', '</main>']);
		const blob = exactResponseBodyOf(response)?.toBlob();

		expect(await blob?.text()).toBe('<main>rendered</main>');
		expect(() => response.stream).toThrow('already claimed');
	});

	it('cancels without constructing the compatibility stream', async () => {
		const response = createExactBufferedResponse(200, {}, 'rendered');

		await exactResponseBodyOf(response)?.cancel('unused');

		expect(() => response.stream).toThrow('already claimed');
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
		expect(exactResponseBodyOf(response)?.kind).toBe('produced');
		await exactResponseBodyOf(response)?.writeTo((chunk) => {
			chunks.push(chunk);
		});

		expect(chunks).toEqual(['<main>', 'ready', '</main>']);
		expect(produce).toHaveBeenCalledTimes(1);
		expect(() => response.body).toThrow('already claimed');
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
		expect(body.writeSynchronously).toBeUndefined();
	});

	it('adapts asynchronous strings to a demand-driven UTF-8 stream', async () => {
		const response = createExactAsyncProducedResponse(200, {}, async (write) => {
			await write('ready ');
			await write('🚀');
		});

		expect(await new Response(response.stream).text()).toBe('ready 🚀');
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
