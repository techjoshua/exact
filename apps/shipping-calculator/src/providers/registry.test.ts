import { describe, expect, it, vi } from 'vitest';
import { defaultDraft, normalizeDraft } from '../model.js';
import { doopProvider } from './doop.js';
import { quoteProvider } from './registry.js';

describe('shipping provider registry cache', () => {
	it('evicts the least-recently used quote when the cache reaches its bound', async () => {
		const quote = vi.spyOn(doopProvider, 'quote');
		const base = normalizeDraft(defaultDraft);
		const signal = new AbortController().signal;

		for (let index = 0; index <= 256; index++) {
			await quoteProvider('doop', { ...base, declaredValueCents: index }, signal);
		}
		await quoteProvider('doop', { ...base, declaredValueCents: 0 }, signal);

		expect(quote).toHaveBeenCalledTimes(258);
		quote.mockRestore();
	});
});
