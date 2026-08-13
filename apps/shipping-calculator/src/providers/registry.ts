import type { ProviderId, ProviderResult, RateProvider, RateRequest } from '../types.js';
import { doopProvider } from './doop.js';
import {
	createDhlProvider,
	createFedexProvider,
	createUpsProvider,
	createUspsProvider,
	ProviderHttpError
} from './live.js';

const providerNames: Record<ProviderId, string> = {
	doop: 'DOOP',
	usps: 'USPS',
	ups: 'UPS',
	fedex: 'FedEx',
	dhl: 'DHL Express'
};
const quoteCache = new Map<
	string,
	{ expiresAt: number; bytes: number; quotes: Awaited<ReturnType<RateProvider['quote']>> }
>();
const maxQuoteCacheEntries = 256;
const maxQuoteCacheBytes = 2 * 1024 * 1024;
const cooldowns = new Map<ProviderId, number>();
const providerRegistries = new WeakMap<NodeJS.ProcessEnv, ProviderRegistry>();
let quoteCacheBytes = 0;
let quoteCacheHits = 0;
let quoteCacheMisses = 0;
let quoteCacheEvictions = 0;
let quoteCacheExpirations = 0;

type ProviderRegistry = Readonly<{
	providers: ReadonlyMap<ProviderId, RateProvider>;
	configured: ReadonlySet<ProviderId>;
	configuredIds: readonly ProviderId[];
}>;

/** Reports bounded quote-cache occupancy and lifetime observations since the last clear. */
export type QuoteCacheMetrics = Readonly<{
	entries: number;
	bytes: number;
	maxEntries: number;
	maxBytes: number;
	hits: number;
	misses: number;
	evictions: number;
	expirations: number;
}>;

/** Returns the startup-stable provider registry cached for one environment object. */
export function createProviderRegistry(
	env: NodeJS.ProcessEnv = process.env
): ReadonlyMap<ProviderId, RateProvider> {
	return providerRegistry(env).providers;
}

/** Returns configured provider identities from startup-stable environment configuration. */
export function configuredProviderIds(env: NodeJS.ProcessEnv = process.env): ProviderId[] {
	return [...providerRegistry(env).configuredIds];
}

/** Returns a value-only snapshot suitable for operational diagnostics. */
export function quoteCacheMetrics(): QuoteCacheMetrics {
	return Object.freeze({
		entries: quoteCache.size,
		bytes: quoteCacheBytes,
		maxEntries: maxQuoteCacheEntries,
		maxBytes: maxQuoteCacheBytes,
		hits: quoteCacheHits,
		misses: quoteCacheMisses,
		evictions: quoteCacheEvictions,
		expirations: quoteCacheExpirations
	});
}

/** Clears cached quotes and their observation counters without changing provider configuration. */
export function clearQuoteCache(): void {
	quoteCache.clear();
	quoteCacheBytes = 0;
	quoteCacheHits = 0;
	quoteCacheMisses = 0;
	quoteCacheEvictions = 0;
	quoteCacheExpirations = 0;
}

/** Creates provider configuration once for an environment object used for the process lifetime. */
function providerRegistry(env: NodeJS.ProcessEnv): ProviderRegistry {
	const cached = providerRegistries.get(env);
	if (cached) return cached;
	const all: RateProvider[] = [
		doopProvider,
		createUspsProvider(env),
		createUpsProvider(env),
		createFedexProvider(env),
		createDhlProvider(env)
	];
	const requested = new Set(
		(env.SHIPPING_PROVIDERS || 'doop').split(',').map((value) => value.trim().toLowerCase())
	);
	requested.add('doop');
	const providers = new Map(all.map((provider) => [provider.id, provider]));
	const configuredIds = [...providers.values()]
		.filter((provider) => requested.has(provider.id) && provider.configured())
		.map((provider) => provider.id);
	const registry = Object.freeze({
		providers,
		configured: new Set(configuredIds),
		configuredIds: Object.freeze(configuredIds)
	});
	providerRegistries.set(env, registry);
	return registry;
}

/** Performs the quote provider domain operation. */
export async function quoteProvider(
	id: ProviderId,
	request: RateRequest,
	signal: AbortSignal,
	env: NodeJS.ProcessEnv = process.env
): Promise<ProviderResult> {
	const registry = providerRegistry(env);
	const provider = registry.providers.get(id)!;
	if (!registry.configured.has(id))
		return {
			version: 1,
			providerId: id,
			providerName: provider.name,
			status: 'not_configured',
			quotes: [],
			error: { code: 'not_configured', message: `${provider.name} is not configured` }
		};
	if (!provider.capabilities.includes(request.kind))
		return {
			version: 1,
			providerId: id,
			providerName: provider.name,
			status: 'success',
			quotes: [],
			error: {
				code: 'invalid_request',
				message: `${provider.name} does not quote ${request.kind}s in this demo`
			}
		};
	const cooldownUntil = cooldowns.get(id) ?? 0;
	if (cooldownUntil > Date.now())
		return {
			version: 1,
			providerId: id,
			providerName: provider.name,
			status: 'error',
			quotes: [],
			error: {
				code: 'rate_limited',
				message: 'The carrier rate limit cooldown is still active',
				retryAfterSeconds: Math.ceil((cooldownUntil - Date.now()) / 1000)
			}
		};
	const cacheKey = `${id}:${JSON.stringify(request)}`;
	pruneQuoteCache(Date.now());
	const cached = quoteCache.get(cacheKey);
	if (cached) {
		// Refresh insertion order so the bounded cache evicts the least-recently
		// used request rather than a frequently reused one.
		quoteCache.delete(cacheKey);
		quoteCache.set(cacheKey, cached);
		quoteCacheHits++;
		return {
			version: 1,
			providerId: id,
			providerName: provider.name,
			status: 'success',
			quotes: cached.quotes
		};
	}
	quoteCacheMisses++;
	const timeout = AbortSignal.timeout(4_000);
	const combined = AbortSignal.any([signal, timeout]);
	try {
		const quotes = await retryUnavailable(
			() => provider.quote(request, { signal: combined, fetch: globalThis.fetch }),
			combined
		);
		if (!combined.aborted) {
			cacheQuotes(cacheKey, quotes, Date.now());
			pruneQuoteCache(Date.now());
		}
		return { version: 1, providerId: id, providerName: provider.name, status: 'success', quotes };
	} catch (error) {
		if (error instanceof ProviderHttpError && error.status === 429)
			cooldowns.set(id, Date.now() + (error.retryAfterSeconds ?? 30) * 1000);
		return {
			version: 1,
			providerId: id,
			providerName: provider.name,
			status: 'error',
			quotes: [],
			error: publicError(error, timeout.aborted)
		};
	}
}

function pruneQuoteCache(now: number): void {
	for (const [key, entry] of quoteCache) {
		if (entry.expiresAt <= now) removeQuoteCacheEntry(key, 'expired');
	}
	while (quoteCache.size > maxQuoteCacheEntries || quoteCacheBytes > maxQuoteCacheBytes) {
		const oldest = quoteCache.keys().next().value;
		if (oldest === undefined) break;
		removeQuoteCacheEntry(oldest, 'evicted');
	}
}

/** Adds one result only when it can fit inside the retained-byte ceiling. */
function cacheQuotes(
	key: string,
	quotes: Awaited<ReturnType<RateProvider['quote']>>,
	now: number
): void {
	const bytes = Buffer.byteLength(key) + Buffer.byteLength(JSON.stringify(quotes));
	if (bytes > maxQuoteCacheBytes) return;
	const previous = quoteCache.get(key);
	if (previous) quoteCacheBytes -= previous.bytes;
	quoteCache.set(key, { expiresAt: now + 5 * 60_000, bytes, quotes });
	quoteCacheBytes += bytes;
}

/** Removes one entry while preserving exact occupancy and reason counters. */
function removeQuoteCacheEntry(key: string, reason: 'expired' | 'evicted'): void {
	const entry = quoteCache.get(key);
	if (!entry) return;
	quoteCache.delete(key);
	quoteCacheBytes -= entry.bytes;
	if (reason === 'expired') quoteCacheExpirations++;
	else quoteCacheEvictions++;
}

/** Performs the provider name domain operation. */
export function providerName(id: ProviderId): string {
	return providerNames[id];
}

async function retryUnavailable<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
	try {
		return await work();
	} catch (error) {
		if (
			!(
				(error instanceof ProviderHttpError && error.status === 503) ||
				error instanceof TypeError
			) ||
			signal.aborted
		)
			throw error;
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(resolve, 120);
			signal.addEventListener(
				'abort',
				() => {
					clearTimeout(timer);
					reject(signal.reason);
				},
				{ once: true }
			);
		});
		return work();
	}
}

function publicError(error: unknown, timedOut: boolean): NonNullable<ProviderResult['error']> {
	if (timedOut) return { code: 'timeout', message: 'The carrier did not respond in time' };
	if (error instanceof ProviderHttpError) {
		if (error.status === 401 || error.status === 403)
			return { code: 'unauthorized', message: 'Carrier credentials were rejected' };
		if (error.status === 429)
			return {
				code: 'rate_limited',
				message: 'The carrier rate limit was reached',
				retryAfterSeconds: error.retryAfterSeconds
			};
	}
	return { code: 'unavailable', message: 'Rates are temporarily unavailable from this carrier' };
}
