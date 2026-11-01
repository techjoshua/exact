import { captureReactiveMutations } from '@exactjs/reactive';
import { verifyIntlMeasurementOwnership } from '../../component-composition-corpus/test-support/intl-measurement-journey.mjs';
import { describe, expect, it } from 'vitest';
import { createIntlEnvironment, intlLocaleMetadata } from './environment.js';
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
	it('matches the public cross-runtime ownership journey', () => {
		expect(
			verifyIntlMeasurementOwnership({
				intlLocaleMetadata,
				captureReactiveMutations,
				createIntlEnvironment,
				resolveIntlMeasurementPresentation,
				convertIntlMeasurementValue,
				formatIntlMeasurementValue
			})
		).toBe(true);
	});
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

describe('measurement presentation revision authority', () => {
	const request = {
		quantity: 'temperature',
		usage: 'weather',
		sourceUnit: 'celsius',
		convertTo: 'fahrenheit',
		values: [20]
	} as const;
	it('does not revive a presentation when public generation is restored', () => {
		const environment = createIntlEnvironment({ locale: 'en-US' });
		const presentation = resolveIntlMeasurementPresentation(environment, request);
		const generation = environment.state.generation;
		environment.setLocale('de-DE');
		expect(() => formatIntlMeasurementValue(presentation, 20)).toThrow(/resolved again/);
		environment.state.generation = generation;
		expect(() => formatIntlMeasurementValue(presentation, 20)).toThrow(/resolved again/);
		expect(
			formatIntlMeasurementValue(resolveIntlMeasurementPresentation(environment, request), 20)
		).toContain('68');
	});

	it('observes direct locale updates even without an authored generation increment', () => {
		const environment = createIntlEnvironment({ locale: 'en-US' });
		const presentation = resolveIntlMeasurementPresentation(environment, request);
		environment.state.locale = 'de-DE';
		expect(() => formatIntlMeasurementValue(presentation, 20)).toThrow(/resolved again/);
		environment.state.locale = 'en-US';
		expect(() => formatIntlMeasurementValue(presentation, 20)).toThrow(/resolved again/);
	});
});

describe('measurement presentation publication', () => {
	it('rejects an environment update caused while reading request options', () => {
		const environment = createIntlEnvironment({ locale: 'en-US' });
		expect(() =>
			resolveIntlMeasurementPresentation(environment, {
				quantity: 'temperature',
				usage: 'weather',
				sourceUnit: 'celsius',
				values: [20],
				options: {
					get maximumFractionDigits() {
						environment.setLocale('de-DE');
						return 1;
					}
				}
			})
		).toThrow(/resolved again/);
		const next = resolveIntlMeasurementPresentation(environment, {
			quantity: 'temperature',
			usage: 'weather',
			sourceUnit: 'celsius',
			values: [20]
		});
		expect(formatIntlMeasurementValue(next, 20)).toBeTruthy();
	});
});

describe('measurement presentation TypeScript readonly', () => {
	it('keeps ordinary writable aliases and copied number options', () => {
		const environment = createIntlEnvironment({ locale: 'en-US' });
		const options = { maximumFractionDigits: 1 };
		const presentation = resolveIntlMeasurementPresentation(environment, {
			quantity: 'temperature',
			usage: 'weather',
			sourceUnit: 'celsius',
			convertTo: 'fahrenheit',
			values: [20],
			options
		});
		presentation.options.maximumFractionDigits = 2;
		expect(options.maximumFractionDigits).toBe(1);
		const alias: { destinationUnits: typeof presentation.destinationUnits } = presentation;
		alias.destinationUnits = ['celsius'];
		expect(convertIntlMeasurementValue(presentation, 20)).toBe(20);
		expect(formatIntlMeasurementValue(presentation, 20)).toContain('20');
		if (false) {
			// @ts-expect-error The public presentation retains its readonly field declarations.
			presentation.sourceUnit = 'fahrenheit';
		}
	});
});

describe('measurement mutation history controls', () => {
	const request = {
		quantity: 'temperature',
		usage: 'weather',
		sourceUnit: 'celsius',
		convertTo: 'fahrenheit',
		values: [20]
	} as const;
	it('keeps unchanged reactive assignments live', () => {
		const environment = createIntlEnvironment({ locale: 'en-US' });
		const presentation = resolveIntlMeasurementPresentation(environment, request);
		environment.state.locale = 'en-US';
		environment.state.generation = environment.state.generation;
		expect(formatIntlMeasurementValue(presentation, 20)).toContain('68');
	});
	it('retires a presentation when its reactive state owner is replaced', () => {
		const environment = { ...createIntlEnvironment({ locale: 'en-US' }) };
		const presentation = resolveIntlMeasurementPresentation(environment, request);
		environment.state = createIntlEnvironment({ locale: 'en-US' }).state;
		expect(() => formatIntlMeasurementValue(presentation, 20)).toThrow(/resolved again/);
	});
	it('does not revive a presentation after reactive rollback restores public state', () => {
		const environment = createIntlEnvironment({ locale: 'en-US' });
		const presentation = resolveIntlMeasurementPresentation(environment, request);
		const journal = captureReactiveMutations(() => environment.setLocale('de-DE'));
		journal.rollback();
		expect(environment.state).toMatchObject({ locale: 'en-US', generation: 0 });
		expect(() => formatIntlMeasurementValue(presentation, 20)).toThrow(/resolved again/);
		expect(
			formatIntlMeasurementValue(resolveIntlMeasurementPresentation(environment, request), 20)
		).toContain('68');
	});
});
