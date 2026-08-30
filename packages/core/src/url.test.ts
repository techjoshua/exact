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
