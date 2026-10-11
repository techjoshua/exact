/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { renderHydrationScript, serializeHydrationPayload } from './hydration.js';

describe('inert hydration JSON escaping', () => {
	it('preserves values and property names across escape ordering, Unicode, and dense input', () => {
		const values = [
			'',
			'plain ASCII',
			'caf\u00e9 \ud83d\ude80 \ud800',
			'</script><script>unsafe</script>',
			'<!--<script>',
			'<!--<ScRiPt >',
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
		for (const value of [...values, ...values.slice().reverse()]) {
			const payload = { [value]: value, nested: [value, 1, true, null] };
			const json = serializeHydrationPayload(payload);
			expect(json).not.toContain('<');
			expect(JSON.parse(json)).toEqual(payload);
			if (!value.includes('<')) expect(json).toBe(JSON.stringify(payload));
		}
	});

	it('retains one inert script and following markup across HTML parser transitions', () => {
		for (const value of [
			'plain\u2028\u2029',
			'</ScRiPt ><script>unsafe</script>',
			'<!--<script>'
		]) {
			const html = renderHydrationScript({ state: { [value]: value } });
			const document = new DOMParser().parseFromString(
				html + '<p id="after">after</p>',
				'text/html'
			);
			expect(document.querySelectorAll('script')).toHaveLength(1);
			expect(JSON.parse(document.querySelector('script')!.textContent!).state).toEqual({
				[value]: value
			});
			expect(document.getElementById('after')?.textContent).toBe('after');
		}
	});
});
