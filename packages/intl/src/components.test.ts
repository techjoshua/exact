import { isExactComponent } from '@exactjs/core/framework/component-contracts';
import { describe, expect, it } from 'vitest';
import { IntlCurrency, IntlMessage, IntlPlural, IntlSelect, IntlUnit } from './components.js';
import { cldr, currency, message, plural, select, unit } from './enhancements.js';

describe('intl component and enhancement surface', () => {
	it('exports each explicit role as the same ordinary component used by its enhancement', () => {
		expect(message).toBe(IntlMessage);
		expect(plural).toBe(IntlPlural);
		expect(select).toBe(IntlSelect);
		expect(currency).toBe(IntlCurrency);
		expect(unit).toBe(IntlUnit);
		expect(cldr).toBe(IntlUnit);
		for (const component of [IntlMessage, IntlPlural, IntlSelect, IntlCurrency, IntlUnit])
			expect(isExactComponent(component)).toBe(true);
	});
});
