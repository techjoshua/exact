import { describe, expect, it } from 'vitest';
import { createExactBufferedResponse, exactResponseBodyOf } from './response-body.js';

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
