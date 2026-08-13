import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultDraft, normalizeDraft } from '../model.js';
import { doopProvider } from './doop.js';
import {
	clearQuoteCache,
	configuredProviderIds,
	createProviderRegistry,
	quoteCacheMetrics,
	quoteProvider
} from './registry.js';

describe('shipping provider registry cache', () => {
	beforeEach(() => clearQuoteCache());
	afterEach(() => vi.restoreAllMocks());

	it('reuses startup-stable provider configuration for one environment', () => {
		const env = { SHIPPING_PROVIDERS: 'doop' } as NodeJS.ProcessEnv;

		expect(createProviderRegistry(env)).toBe(createProviderRegistry(env));
		expect(configuredProviderIds(env)).toEqual(['doop']);
	});

	it('evicts the least-recently used quote when the cache reaches its bound', async () => {
		const quote = vi.spyOn(doopProvider, 'quote');
		const base = normalizeDraft(defaultDraft);
		const signal = new AbortController().signal;

		for (let index = 0; index <= 256; index++) {
			await quoteProvider('doop', { ...base, declaredValueCents: index }, signal);
		}
		await quoteProvider('doop', { ...base, declaredValueCents: 0 }, signal);

		expect(quote).toHaveBeenCalledTimes(258);
		expect(quoteCacheMetrics()).toMatchObject({ entries: 256, evictions: 2 });
	});

	it('bounds retained quote payload bytes as well as entry count', async () => {
		const base = normalizeDraft(defaultDraft);
		const template = (
			await doopProvider.quote(base, {
				signal: new AbortController().signal,
				fetch: globalThis.fetch
			})
		)[0]!;
		vi.spyOn(doopProvider, 'quote').mockImplementation(async () => [
			{ ...template, warnings: ['x'.repeat(900_000)] }
		]);

		for (let index = 0; index < 3; index++)
			await quoteProvider(
				'doop',
				{ ...base, declaredValueCents: index },
				new AbortController().signal
			);

		const metrics = quoteCacheMetrics();
		expect(metrics.bytes).toBeLessThanOrEqual(metrics.maxBytes);
		expect(metrics.entries).toBe(2);
		expect(metrics.evictions).toBe(1);
	});

	it('does not allocate timeout signals for cache hits', async () => {
		const timeout = vi.spyOn(AbortSignal, 'timeout');
		const request = normalizeDraft(defaultDraft);
		const signal = new AbortController().signal;

		await quoteProvider('doop', request, signal);
		await quoteProvider('doop', request, signal);

		expect(timeout).toHaveBeenCalledTimes(1);
		expect(quoteCacheMetrics()).toMatchObject({ hits: 1, misses: 1 });
	});
});
