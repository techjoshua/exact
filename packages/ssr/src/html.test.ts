import { describe, expect, it } from 'vitest';
import { escapeAttr, escapeAttrName, escapeText } from './html.js';

describe('HTML context escaping', () => {
	it('escapes each authored character once without re-escaping generated entities', () => {
		expect(escapeText('&<>&amp;"')).toBe('&amp;&lt;&gt;&amp;amp;"');
		expect(escapeAttr('&<>&amp;"')).toBe('&amp;&lt;&gt;&amp;amp;&quot;');
	});
	it('keeps repeated text, attribute and name checks independent', () => {
		for (let pass = 0; pass < 4; pass++) {
			expect(escapeText('<<&>')).toBe('&lt;&lt;&amp;&gt;');
			expect(escapeAttr('"<&>"')).toBe('&quot;&lt;&amp;&gt;&quot;');
			expect(escapeText('safe')).toBe('safe');
			expect(escapeAttr('safe')).toBe('safe');
			expect(escapeText('<')).toBe('&lt;');
			expect(escapeAttr('"')).toBe('&quot;');
			expect(escapeAttrName('data-exact:ready')).toBe('data-exact:ready');
			expect(escapeAttrName('title" onclick="')).toBe('data-exact-invalid-attr');
		}
	});
	it('preserves ordinary text, Unicode and unpaired surrogate code units', () => {
		for (const value of ['', 'plain text', 'caf\u00e9 \ud83d\ude80 \u65e5', '\ud800x\udc00']) {
			expect(escapeText(value)).toBe(value);
			expect(escapeAttr(value)).toBe(value);
		}
	});
});
