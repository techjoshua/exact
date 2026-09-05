import { describe, expect, it } from 'vitest';
import { createIntlEnvironment } from './environment.js';
import {
	convertIntlMeasurementValue,
	formatIntlMeasurementRange,
	formatIntlMeasurementValue,
	resolveIntlMeasurementPresentation,
	restoreIntlMeasurementValue
} from './measurement-presentation.js';
import { prepareIntlActivation } from './prepared.js';
import { renderIntlActivation } from './render.js';
import { measurementDescriptor } from './test-support/measurement-descriptor.js';

describe('public measurement presentation', () => {
	it('shares conversion and formatting behavior with prepared unit messages', () => {
		const descriptor = measurementDescriptor('temperature', 'weather', 'celsius', {
			unitDisplay: 'short',
			maximumFractionDigits: 0
		});
		const environment = createIntlEnvironment({
			locale: 'en-US',
			descriptors: [descriptor],
			unitPreferences: { 'temperature/weather': 'fahrenheit' }
		});
		const presentation = resolveIntlMeasurementPresentation(environment, {
			quantity: 'temperature',
			usage: 'weather',
			sourceUnit: 'celsius',
			values: [20],
			options: { unitDisplay: 'short', maximumFractionDigits: 0 }
		});

		expect(convertIntlMeasurementValue(presentation, 20)).toBeCloseTo(68, 12);
		expect(restoreIntlMeasurementValue(presentation, 68)).toBeCloseTo(20, 12);
		expect(formatIntlMeasurementValue(presentation, 20)).toBe(
			String(renderIntlActivation(prepareIntlActivation(descriptor, [20]), environment)[0])
		);
	});

	it('uses one destination decision for ranges and scalar chart geometry', () => {
		const environment = createIntlEnvironment({
			locale: 'en-US',
			unitPreferences: { 'length/person-height': ['foot', 'inch'] }
		});
		const presentation = resolveIntlMeasurementPresentation(environment, {
			quantity: 'length',
			usage: 'person-height',
			sourceUnit: 'centimeter',
			unitComposition: 'single',
			convertTo: 'auto',
			values: [150, 200],
			options: { maximumFractionDigits: 1 }
		});

		expect(presentation.destinationUnits).toEqual(['foot']);
		expect(convertIntlMeasurementValue(presentation, 180)).toBeCloseTo(5.9055, 4);
		expect(formatIntlMeasurementRange(presentation, 150, 200)).toMatch(/4\.9.*6\.6.*ft/u);
	});

	it('rejects absent, non-finite, and dimensionally incompatible inputs', () => {
		const environment = createIntlEnvironment({ locale: 'en-US' });
		expect(() =>
			resolveIntlMeasurementPresentation(environment, {
				quantity: 'temperature',
				usage: 'weather',
				sourceUnit: 'celsius',
				values: []
			})
		).toThrow('representative values');
		expect(() =>
			resolveIntlMeasurementPresentation(environment, {
				quantity: 'temperature',
				usage: 'weather',
				sourceUnit: 'celsius',
				values: [Number.NaN]
			})
		).toThrow('finite');
		expect(() =>
			resolveIntlMeasurementPresentation(environment, {
				quantity: 'temperature',
				usage: 'weather',
				sourceUnit: 'celsius',
				convertTo: 'mile',
				values: [20]
			})
		).toThrow('Unsupported intl unit conversion');
	});

	it('requires a new presentation after locale or preference policy changes', () => {
		const environment = createIntlEnvironment({ locale: 'en-US' });
		const presentation = resolveIntlMeasurementPresentation(environment, {
			quantity: 'temperature',
			usage: 'weather',
			sourceUnit: 'celsius',
			values: [20]
		});

		environment.setLocale('fr-FR');
		expect(() => formatIntlMeasurementValue(presentation, 20)).toThrow('must be resolved again');
	});
});
