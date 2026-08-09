import { describe, expect, it } from 'vitest';
import type { IntlRuntimeDescriptorV1 } from './contracts.js';
import { createIntlEnvironment } from './environment.js';
import { prepareIntlActivation } from './prepared.js';
import { renderIntlActivation } from './render.js';
import { convertIntlUnit } from './unit-definitions.js';
import { validateIntlRuntimeDescriptor } from './validation.js';

const messageKey = '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU';

describe('expanded semantic unit conversion', () => {
	it.each([
		['area', 1, 'acre', 'hectare', 0.40468564224],
		['mass', 1, 'pound', 'kilogram', 0.45359237],
		['volume', 1, 'gallon', 'liter', 3.785411784],
		['speed', 60, 'mile-per-hour', 'kilometer-per-hour', 96.56064],
		['pressure', 1, 'pound-force-per-square-inch', 'kilopascal', 6.894757293168],
		['energy', 1, 'kilowatt-hour', 'kilojoule', 3600],
		['power', 1, 'horsepower', 'kilowatt', 0.7456998715822702],
		['fuel economy', 30, 'mile-per-gallon', 'liter-per-100-kilometer', 7.8404861],
		['digital storage', 1, 'gigabyte', 'megabyte', 1000]
	] as const)(
		'converts %s without crossing dimensions',
		(_family, value, source, target, expected) => {
			expect(convertIntlUnit(value, source, target)).toBeCloseTo(expected, 8);
		}
	);

	it('uses locale preferences and localized placement for units outside native Intl unit syntax', () => {
		const pressure = measurementDescriptor('pressure', 'weather', 'inch-of-mercury');
		const environment = createIntlEnvironment({ locale: 'de-DE', descriptors: [pressure] });

		expect(
			String(renderIntlActivation(prepareIntlActivation(pressure, [29.92]), environment)[0])
		).toMatch(/^1\.013,21\s?hPa$/u);
	});

	it('retains enough converted precision to avoid collapsing a nonzero CLDR result to zero', () => {
		const fuel = measurementDescriptor('fuel-economy', 'road', 'mile-per-gallon');
		const land = measurementDescriptor('area', 'land', 'acre');
		const environment = createIntlEnvironment({ locale: 'ja-JP', descriptors: [fuel, land] });

		expect(
			String(renderIntlActivation(prepareIntlActivation(fuel, [30]), environment)[0])
		).toContain('0.08');
		environment.setLocale('fr-FR');
		expect(String(renderIntlActivation(prepareIntlActivation(land, [2]), environment)[0])).toMatch(
			/^1\s?ha$/u
		);
	});

	it('rejects conversion between unrelated semantic quantities', () => {
		expect(() =>
			validateIntlRuntimeDescriptor({
				...measurementDescriptor('mass', 'person', 'kilogram'),
				source: [
					{
						kind: 'format',
						bindings: [0],
						formatter: {
							kind: 'unit',
							quantity: 'mass',
							usage: 'person',
							sourceUnit: 'kilogram',
							convertTo: 'liter',
							options: {}
						}
					}
				]
			})
		).toThrow('dimensionally incompatible');
	});
});

function measurementDescriptor(
	quantity: string,
	usage: string,
	sourceUnit: string
): IntlRuntimeDescriptorV1 {
	return {
		protocol: 1,
		owner: `measurements-${quantity}`,
		occurrenceId: `${quantity}:${usage}`,
		contract: contractFixture(`${quantity}-${usage}-${sourceUnit}`),
		key: messageKey,
		sourceLocale: 'en-US',
		target: { kind: 'content' },
		bindings: [{ index: 0, kind: 'value', type: 'measurement' }],
		source: [
			{
				kind: 'format',
				bindings: [0],
				formatter: {
					kind: 'unit',
					quantity,
					usage,
					sourceUnit,
					precision: 'source',
					options: { unitDisplay: 'short' }
				}
			}
		],
		capabilities: ['unit']
	};
}

function contractFixture(value: string): string {
	return value
		.replace(/[^A-Za-z0-9_-]/gu, '-')
		.padEnd(43, 'x')
		.slice(0, 43);
}
