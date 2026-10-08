import { changingUrl } from '../../component-composition-corpus/test-support/url-coercion.js';
import { projectedAttributes } from './component-abi/text-projection-markup.js';
import { describe, expect, it } from 'vitest';
import { BLOCKED_JAVASCRIPT_URL, sanitizeUrlAttribute, unsafeHtml } from './index.js';
import { readUnsafeHtmlReceipt } from './runtime/component-abi.js';

describe('native URL and raw HTML primitives', () => {
	it('blocks obfuscated javascript protocols only for URL attributes', () => {
		expect(sanitizeUrlAttribute('href', '\u0000 j\na\tv\ra\ns\tc\rr\ni\tp\tt:alert(1)')).toBe(
			BLOCKED_JAVASCRIPT_URL
		);
		expect(sanitizeUrlAttribute('href', 'https://example.test')).toBe('https://example.test');
		expect(sanitizeUrlAttribute('title', 'javascript:alert(1)')).toBe('javascript:alert(1)');
	});

	it('represents unsafe HTML as an opaque target receipt rather than a magic prop', () => {
		const value = unsafeHtml('<strong>trusted by caller</strong>');
		expect(Object.keys(value)).toEqual([]);
		expect(readUnsafeHtmlReceipt(value)?.value).toBe('<strong>trusted by caller</strong>');
	});
});

it.each(['primitive', 'string'] as const)('retains the checked URL conversion (%s)', (method) => {
	for (const first of ['/safe?first=1&second=2', 'j\na\tv\ra\ns\tc\rr\ni\tp\tt:probe']) {
		const direct = changingUrl(first, 'javascript:unchecked', method);
		expect(sanitizeUrlAttribute('HREF', direct.value)).toBe(
			first.startsWith('/') ? first : BLOCKED_JAVASCRIPT_URL
		);
		expect(direct.calls()).toBe(1);
		const projected = changingUrl(first, 'javascript:unchecked', method);
		expect(projectedAttributes({ href: projected.value }, 'a', {})).toBe(
			first.startsWith('/')
				? ' href="/safe?first=1&amp;second=2"'
				: ` href="${BLOCKED_JAVASCRIPT_URL}"`
		);
		expect(projected.calls()).toBe(1);
	}
});

it('preserves primitive URL values and does not coerce unrelated props', () => {
	for (const value of [null, undefined, true, false, 0, 1n, Symbol('safe'), 'https://example.test'])
		expect(sanitizeUrlAttribute('href', value)).toBe(value);
	const other = changingUrl();
	expect(sanitizeUrlAttribute('title', other.value)).toBe(other.value);
	expect(other.calls()).toBe(0);
});

it('retains callable conversions and propagates coercion failures', () => {
	const fn = Object.assign(() => undefined, { toString: () => '/callable' });
	expect(sanitizeUrlAttribute('href', fn)).toBe('/callable');
	const error = new Error('conversion failed');
	expect(() =>
		sanitizeUrlAttribute('href', {
			toString() {
				throw error;
			}
		})
	).toThrow(error);
});

it('shares the conversion rule across supported URL names', () => {
	for (const name of ['action', 'formAction', 'href', 'src', 'xlink:href', 'xlinkHref']) {
		const fixture = changingUrl();
		expect(sanitizeUrlAttribute(name, fixture.value)).toBe('/safe?first=1&second=2');
		expect(fixture.calls()).toBe(1);
	}
});
