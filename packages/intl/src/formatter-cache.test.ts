import { describe, expect, it } from 'vitest';
import { createIntlEnvironment } from './environment.js';
import { numberFormatter, pluralRulesFormatter } from './formatter-cache.js';

describe('intl environment formatter cache', () => {
	it('reuses native formatters within one environment and isolates providers', () => {
		const first = createIntlEnvironment({ locale: 'en-US' });
		const second = createIntlEnvironment({ locale: 'en-US' });

		expect(numberFormatter(first, { style: 'decimal' })).toBe(
			numberFormatter(first, { style: 'decimal' })
		);
		expect(numberFormatter(first, { style: 'decimal' })).not.toBe(
			numberFormatter(second, { style: 'decimal' })
		);
		expect(pluralRulesFormatter(first, 'ordinal').select(21)).toBe('one');
	});

	it('keys reused formatters by the environment current locale', () => {
		const environment = createIntlEnvironment({ locale: 'en-US' });
		const english = pluralRulesFormatter(environment, 'ordinal');

		environment.setLocale('fr-FR');

		expect(pluralRulesFormatter(environment, 'ordinal')).not.toBe(english);
	});
});
