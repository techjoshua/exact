import { describe, expect, it } from 'vitest';
import { createDefaultIntlEnvironment } from './environment.js';
import { formatIntlDateTimeValue, formatIntlNumberValue } from './value-presentation.js';

describe('public intl value presentation', () => {
	it('uses the active locale for runtime-generated numbers and dates', () => {
		const environment = createDefaultIntlEnvironment('de-DE');
		expect(formatIntlNumberValue(environment, 1234.5)).toContain('1.234,5');
		expect(
			formatIntlDateTimeValue(environment, new Date('2026-09-04T12:00:00Z'), {
				timeZone: 'UTC',
				year: 'numeric'
			})
		).toContain('2026');
	});

	it('rejects invalid runtime values before invoking native formatters', () => {
		const environment = createDefaultIntlEnvironment('en-US');
		expect(() => formatIntlNumberValue(environment, Number.NaN)).toThrow(/finite/);
		expect(() => formatIntlDateTimeValue(environment, new Date(Number.NaN))).toThrow(/valid/);
	});
});
