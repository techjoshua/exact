import { expect, it } from 'vitest';
import { localeFallbackChain } from './locale-resolution.js';

it('shares frozen chains without mixing locale candidates', () => {
	const french = localeFallbackChain('fr-CA');
	const chinese = localeFallbackChain('zh-Hant-TW-u-nu-latn');
	expect(french).toEqual(['fr-CA', 'fr']);
	expect(chinese).toEqual(['zh-Hant-TW-u-nu-latn', 'zh-Hant-TW', 'zh-Hant', 'zh']);
	expect(localeFallbackChain('fr-CA')).toBe(french);
	expect(Object.isFrozen(french)).toBe(true);
	expect(() => (french as string[]).push('de')).toThrow();
	expect(() => localeFallbackChain('not_a_locale')).toThrow('valid BCP 47 locale');
});

it('bounds shared retention while preserving live lists and recently used locales', () => {
	const retained = localeFallbackChain('en-US-x-retained');
	const oldest = localeFallbackChain('en-US-x-oldest');
	for (let index = 0; index < 126; index++) localeFallbackChain(`en-US-x-pool-${index}`);
	expect(localeFallbackChain('en-US-x-retained')).toBe(retained);
	localeFallbackChain('en-US-x-overflow');
	expect(localeFallbackChain('en-US-x-retained')).toBe(retained);
	expect(localeFallbackChain('en-US-x-oldest')).not.toBe(oldest);
	expect(oldest).toEqual(['en-US-x-oldest', 'en-US', 'en']);
});
