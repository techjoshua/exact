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
	{ expiresAt: number; quotes: Awaited<ReturnType<RateProvider['quote']>> }
>();
const maxQuoteCacheEntries = 256;
const cooldowns = new Map<ProviderId, number>();

/** Creates a provider registry. */
export function createProviderRegistry(
	env: NodeJS.ProcessEnv = process.env
): Map<ProviderId, RateProvider> {
	const all: RateProvider[] = [
		doopProvider,
		createUspsProvider(env),
		createUpsProvider(env),
		createFedexProvider(env),
		createDhlProvider(env)
	];
	return new Map(all.map((provider) => [provider.id, provider]));
}

/** Performs the configured provider ids domain operation. */
export function configuredProviderIds(env: NodeJS.ProcessEnv = process.env): ProviderId[] {
	const requested = new Set(
		(env.SHIPPING_PROVIDERS || 'doop').split(',').map((value) => value.trim().toLowerCase())
	);
	requested.add('doop');
	return [...createProviderRegistry(env).values()]
		.filter((provider) => requested.has(provider.id) && provider.configured())
		.map((provider) => provider.id);
}

/** Performs the quote provider domain operation. */
export async function quoteProvider(
	id: ProviderId,
	request: RateRequest,
	signal: AbortSignal,
	env: NodeJS.ProcessEnv = process.env
): Promise<ProviderResult> {
	const provider = createProviderRegistry(env).get(id)!;
	if (!provider.configured() || !configuredProviderIds(env).includes(id))
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
	const timeout = AbortSignal.timeout(4_000);
	const combined = AbortSignal.any([signal, timeout]);
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
		return {
			version: 1,
			providerId: id,
			providerName: provider.name,
			status: 'success',
			quotes: cached.quotes
		};
	}
	try {
		const quotes = await retryUnavailable(
			() => provider.quote(request, { signal: combined, fetch: globalThis.fetch }),
			combined
		);
		if (!combined.aborted) {
			quoteCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60_000, quotes });
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
		if (entry.expiresAt <= now) quoteCache.delete(key);
	}
	while (quoteCache.size > maxQuoteCacheEntries) {
		const oldest = quoteCache.keys().next().value;
		if (oldest === undefined) break;
		quoteCache.delete(oldest);
	}
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
