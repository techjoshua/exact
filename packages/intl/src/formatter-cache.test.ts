import { describe, expect, it } from 'vitest';
import { createIntlEnvironment } from './environment.js';
import { numberFormatter, pluralRulesFormatter } from './formatter-cache.js';

describe('intl environment formatter cache', () => {
	it('retains a canonical authored source locale independently of the active locale', () => {
		const environment = createIntlEnvironment({ locale: 'fr-fr', sourceLocale: 'en-us' });

		expect(environment.state.locale).toBe('fr-FR');
		expect(environment.sourceLocale).toBe('en-US');
	});

	it('reuses native formatters across providers with the same effective locale and options', () => {
		const first = createIntlEnvironment({ locale: 'en-US' });
		const second = createIntlEnvironment({ locale: 'en-US' });

		expect(numberFormatter(first, { style: 'decimal' })).toBe(
			numberFormatter(first, { style: 'decimal' })
		);
		expect(numberFormatter(first, { style: 'decimal' })).toBe(
			numberFormatter(second, { style: 'decimal' })
		);
		expect(pluralRulesFormatter(first, 'ordinal').select(21)).toBe('one');
	});

	it('keys reused formatters by the environment current locale', () => {
		const environment = createIntlEnvironment({ locale: 'en-US' });
		const english = pluralRulesFormatter(environment, 'ordinal');

		environment.setLocale('fr-FR');

		expect(pluralRulesFormatter(environment, 'ordinal')).not.toBe(english);
		environment.setLocale('en-US');
		expect(pluralRulesFormatter(environment, 'ordinal')).toBe(english);
	});
});
