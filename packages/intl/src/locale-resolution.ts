import { intl } from '@exactjs/core';
import type { IntlLocaleString } from './cldr-locale-types.js';

const maximumFallbackChains = 128;
// Only immutable locale strings are shared. Environments, catalogs, and callbacks never enter this pool.
const fallbackChains = new Map<string, readonly string[]>();

/** Validates a locale and returns its canonical identifier without changing environment state. */
export function canonicalLocale(locale: string): IntlLocaleString {
	let canonical: string | undefined;
	try {
		[canonical] = intl.getCanonicalLocales(locale);
	} catch {
		throw new TypeError('Intl locale must be a valid BCP 47 locale');
	}
	if (!canonical) throw new TypeError('Intl locale must be a valid BCP 47 locale');
	return canonical as IntlLocaleString;
}

/**
 * Shares immutable fallback lists across environments using this runtime module. The 128-entry LRU
 * bounds retention across locale churn. Eviction does not invalidate lists held by live environments.
 * Normal environment state is canonical; direct state writes are validated on a cache miss.
 */
export function localeFallbackChain(locale: string): readonly string[] {
	const cached = fallbackChains.get(locale);
	if (cached) {
		fallbackChains.delete(locale);
		fallbackChains.set(locale, cached);
		return cached;
	}
	const canonical = canonicalLocale(locale);
	const parsed = intl.Locale(canonical);
	const candidates = [canonical, parsed.baseName];
	if (parsed.script)
		candidates.push(intl.Locale(parsed.language, { script: parsed.script }).baseName);
	candidates.push(parsed.language);
	const chain = Object.freeze([...new Set(candidates)]);
	fallbackChains.set(locale, chain);
	if (fallbackChains.size > maximumFallbackChains)
		fallbackChains.delete(fallbackChains.keys().next().value!);
	return chain;
}
