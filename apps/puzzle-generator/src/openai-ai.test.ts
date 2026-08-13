import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateOpenAiWordList } from './openai-ai.js';

describe('OpenAI puzzle input generation', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('requests strict structured output without placing the key in the body', async () => {
		const content = JSON.stringify({
			words: ['ORBIT', 'COMET', 'PLANET', 'GALAXY', 'NEBULA', 'LUNAR']
		});
		const fetchMock = vi.fn().mockResolvedValue(
			new Response(
				JSON.stringify({
					output: [{ type: 'message', content: [{ type: 'output_text', text: content }] }]
				}),
				{ status: 200, headers: { 'Content-Type': 'application/json' } }
			)
		);
		vi.stubGlobal('fetch', fetchMock);

		const result = await generateOpenAiWordList(
			'sk-secret',
			'gpt-4.1-mini',
			'space',
			'word-search',
			'Create words about {{topic}}.',
			() => undefined
		);
		const [url, init] = fetchMock.mock.calls[0]!;
		const request = JSON.parse(init.body as string);

		expect(url).toBe('https://api.openai.com/v1/responses');
		expect(init.headers.Authorization).toBe('Bearer sk-secret');
		expect(init.body).not.toContain('sk-secret');
		expect(request.text.format.type).toBe('json_schema');
		expect(request.text.format.strict).toBe(true);
		expect(result).toBe('ORBIT\nCOMET\nPLANET\nGALAXY\nNEBULA\nLUNAR');
	});

	it('surfaces an OpenAI error message without returning invalid input', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), {
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				})
			)
		);

		await expect(
			generateOpenAiWordList(
				'sk-invalid',
				'gpt-4.1-mini',
				'space',
				'word-search',
				'Create words about {{topic}}.',
				() => undefined
			)
		).rejects.toThrow('Incorrect API key provided');
	});
});
