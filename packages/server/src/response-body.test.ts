import { describe, expect, it, vi } from 'vitest';
import {
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
