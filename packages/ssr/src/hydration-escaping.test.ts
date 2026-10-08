import { describe, expect, it } from 'vitest';
import { serializeHydrationPayload } from './hydration.js';

describe('inert hydration JSON escaping', () => {
	it('preserves values and property names across escape ordering, Unicode, and dense input', () => {
		const values = [
			'',
			'plain ASCII',
			'caf\u00e9 \ud83d\ude80 \ud800',
			'</script><script>unsafe</script>',
			'<',
			'\u2028',
			'\u2029',
			'<\u2028\u2029',
			'\u2029\u2028<',
			'\u2028<\u2029',
			'\u2029<\u2028',
			'\u2028\u2029<',
			'<\u2029\u2028',
			'x'.repeat(3990) + '<\u2028\u2029',
			'x<\u2028\u2029'.repeat(1000),
			'\\u003C\\u2028\\u2029'
		];
		// Repeat in reverse order to expose leaked search state between serializations.
		for (const value of [...values, ...values.toReversed()]) {
			const payload = { [value]: value, nested: [value, 1, true, null] };
			const json = serializeHydrationPayload(payload);
			expect(json).not.toMatch(/[<\u2028\u2029]/);
			expect(JSON.parse(json)).toEqual(payload);
			expect(json).toBe(
				JSON.stringify(payload)
					.replace(/</g, '\\u003C')
					.replace(/\u2028/g, '\\u2028')
					.replace(/\u2029/g, '\\u2029')
			);
		}
	});
});
