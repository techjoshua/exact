import { expect, it } from 'vitest';
import { hrefFor, resolveTarget } from './core.js';

it.each(['history', 'hash'] as const)(
	'preserves network-relative authorities in %s mode with and without a basename',
	(mode) => {
		const current = new URL('https://here.example/app/current');
		for (const basename of ['', '/app']) {
			const external = '//elsewhere.example/next?tab=one#details';
			expect(hrefFor(external, current, basename, mode)).toBe(external);
			expect(resolveTarget(external, current, basename, mode).href).toBe(
				'https://elsewhere.example/next?tab=one#details'
			);
			const absolute = 'https://elsewhere.example/next';
			expect(hrefFor(absolute, current, basename, mode)).toBe(absolute);
			expect(resolveTarget(absolute, current, basename, mode).href).toBe(absolute);
			expect(hrefFor('/next', current, basename, mode)).toBe(
				`${mode === 'hash' ? '#' : ''}${basename}/next`
			);
			const owned = new URL('https://elsewhere.example/next');
			expect(resolveTarget(owned, current, basename, mode)).toBe(owned);
			expect(hrefFor(owned, current, basename, mode)).toBe(owned.href);
		}
	}
);
