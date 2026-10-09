/** @vitest-environment jsdom */
import { expect, it } from 'vitest';
import { applyDomProp } from './props.js';

it('retains false ARIA states through updates and removes absent values', () => {
	const element = document.createElement('button');
	for (const name of ['aria-pressed', 'aria-expanded', 'aria-hidden', 'ARIA-CHECKED']) {
		for (const value of [false, true, false, 'mixed', null, undefined]) {
			applyDomProp(element, name, value);
			expect(element.getAttribute(name)).toBe(value == null ? null : String(value));
		}
	}
	applyDomProp(element, 'data-selected', true);
	expect(element.getAttribute('data-selected')).toBe('true');
	applyDomProp(element, 'data-selected', false);
	expect(element.hasAttribute('data-selected')).toBe(false);
	applyDomProp(element, 'disabled', true);
	expect(element.disabled).toBe(true);
	applyDomProp(element, 'disabled', false);
	expect(element.disabled).toBe(false);
});
