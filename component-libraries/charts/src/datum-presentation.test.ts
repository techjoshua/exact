import { createDefaultIntlEnvironment } from '@exactjs/intl';
import { expect, it } from 'vitest';
import { rangeSummary } from './datum-presentation.js';

it.each(['en-US', 'de-DE'] as const)(
	'keeps range fields distinct from %s numeric punctuation',
	(locale) => {
		const environment = createDefaultIntlEnvironment(locale);
		const summary = rangeSummary(
			{ id: 'range', x: 0, minimum: 900.5, maximum: 1100.5, value: 1000.5 },
			undefined,
			undefined,
			environment
		);
		const fields = summary.split(' | ');
		expect(fields).toHaveLength(2);
		expect(fields.every((field) => field.includes(','))).toBe(true);
		expect(fields[0]).toContain('–');
		expect(fields[1]).not.toContain('–');
	}
);
