import { describe, expect, it } from 'vitest';
import { createIntlEnvironment } from './environment.js';
import {
	convertIntlMeasurementValue,
	formatIntlMeasurementValue,
	resolveIntlMeasurementPresentation,
	restoreIntlMeasurementValue
} from './measurement-presentation.js';
import { prepareIntlActivation } from './prepared.js';
import { renderIntlActivation } from './render.js';
import { measurementDescriptor } from './test-support/measurement-descriptor.js';
import {
	convertIntlUnitDifference,
	convertIntlUnitEndpointDifference
} from './unit-definitions.js';
import { validateIntlRuntimeDescriptor } from './validation.js';

function descriptor(
	mode: 'value' | 'endpoints',
	quantity = 'temperature',
	sourceUnit = 'fahrenheit',
	convertTo = 'celsius'
) {
	const base = measurementDescriptor(
		quantity,
		quantity === 'temperature' ? 'weather' : 'road',
		sourceUnit,
		{ unitDisplay: 'short', maximumFractionDigits: 3 }
	);
	const node = base.source[0]!;
	if (node.kind !== 'format' || node.formatter.kind !== 'unit') throw new Error('invalid fixture');
	return {
		...base,
		bindings:
			mode === 'endpoints' ? [...base.bindings, { ...base.bindings[0]!, index: 1 }] : base.bindings,
		source: [
			{
				...node,
				bindings: mode === 'endpoints' ? [0, 1] : [0],
				formatter: { ...node.formatter, difference: mode, convertTo }
			}
		]
	};
}

describe('signed measurement differences', () => {
	it.each(['fr-FR', 'ar-EG'] as const)('formats differences in the active locale %s', (locale) => {
		const environment = createIntlEnvironment({ locale });
		expect(
			renderIntlActivation(prepareIntlActivation(descriptor('value'), [30]), environment).join('')
		).toBe(
			new Intl.NumberFormat(locale, {
				style: 'unit',
				unit: 'celsius',
				unitDisplay: 'short',
				maximumFractionDigits: 3
			}).format(30 * (5 / 9))
		);
	});

	it.each([30, -30, 0, 1e-12])('converts a Fahrenheit difference without offsets (%s)', (value) => {
		const environment = createIntlEnvironment({ locale: 'en-US' });
		const presentation = resolveIntlMeasurementPresentation(environment, {
			quantity: 'temperature',
			usage: 'weather',
			sourceUnit: 'fahrenheit',
			convertTo: 'celsius',
			difference: true,
			values: [value]
		});
		expect(convertIntlMeasurementValue(presentation, value)).toBe(value * (5 / 9));
		expect(restoreIntlMeasurementValue(presentation, value * (5 / 9))).toBeCloseTo(value, 12);
	});
	it('keeps absolute readings and signed scalar and endpoint differences distinct', () => {
		const environment = createIntlEnvironment({ locale: 'en-US' });
		const absolute = resolveIntlMeasurementPresentation(environment, {
			quantity: 'temperature',
			usage: 'weather',
			sourceUnit: 'fahrenheit',
			convertTo: 'celsius',
			values: [80, 50],
			options: { maximumFractionDigits: 3 }
		});
		expect(convertIntlMeasurementValue(absolute, 80)).toBeCloseTo(26.6666667, 6);
		expect(convertIntlMeasurementValue(absolute, 50)).toBeCloseTo(10, 12);
		expect(formatIntlMeasurementValue(absolute, 50)).toContain('10');
		const scalar = renderIntlActivation(
			prepareIntlActivation(descriptor('value'), [30]),
			environment
		).join('');
		const endpoints = renderIntlActivation(
			prepareIntlActivation(descriptor('endpoints'), [80, 50]),
			environment
		).join('');
		expect(scalar).toBe('16.667°C');
		expect(endpoints).toBe(scalar);
		expect(
			renderIntlActivation(
				prepareIntlActivation(descriptor('endpoints'), [50, 80]),
				environment
			).join('')
		).toBe('-16.667°C');
		expect(convertIntlUnitDifference(30, 'kelvin', 'celsius')).toBe(30);
		expect(convertIntlUnitEndpointDifference(80, 80, 'fahrenheit', 'celsius')).toBe(0);
	});
	it('converts reciprocal endpoints before subtracting, and rejects missing or nonfinite endpoints', () => {
		const environment = createIntlEnvironment({ locale: 'en-US' });
		const endpoints = descriptor(
			'endpoints',
			'fuel-economy',
			'mile-per-gallon',
			'liter-per-100-kilometer'
		);
		expect(
			renderIntlActivation(prepareIntlActivation(endpoints, [30, 20]), environment).join('')
		).toBe('-3.92 L/100 km');
		expect(() =>
			renderIntlActivation(
				prepareIntlActivation(
					descriptor('value', 'fuel-economy', 'mile-per-gallon', 'liter-per-100-kilometer'),
					[10]
				),
				environment
			)
		).toThrow('both endpoints');
		expect(() =>
			renderIntlActivation(prepareIntlActivation(endpoints, [30, 0]), environment)
		).toThrow('finite');
		expect(() => convertIntlUnitDifference(1, 'fahrenheit', 'meter')).toThrow('Unsupported');
	});
	it('validates difference modes and binding arity before publishing a descriptor', () => {
		const valid = descriptor('endpoints');
		expect(() => validateIntlRuntimeDescriptor(valid)).not.toThrow();
		expect(() =>
			validateIntlRuntimeDescriptor({ ...valid, source: [{ ...valid.source[0], bindings: [0] }] })
		).toThrow('difference bindings');
		expect(() =>
			validateIntlRuntimeDescriptor({
				...valid,
				source: [
					{ ...valid.source[0], formatter: { ...valid.source[0]!.formatter, difference: true } }
				]
			})
		).toThrow('difference is unsupported');
	});
});
