import { describe, expect, it } from 'vitest';
import { escapeAttr, escapeText } from './html.js';

describe('HTML context escaping', () => {
	it('escapes each authored character once without re-escaping generated entities', () => {
		expect(escapeText('&<>&amp;"')).toBe('&amp;&lt;&gt;&amp;amp;"');
		expect(escapeAttr('&<>&amp;"')).toBe('&amp;&lt;&gt;&amp;amp;&quot;');
	});
	it('preserves ordinary text, Unicode and unpaired surrogate code units', () => {
		for (const value of ['', 'plain text', 'caf\u00e9 \ud83d\ude80 \u65e5', '\ud800x\udc00']) {
			expect(escapeText(value)).toBe(value);
			expect(escapeAttr(value)).toBe(value);
		}
	});
});
