import { describe, expect, it } from 'vitest';
import { unwrap } from '@exactjs/core';
import { readCompiledComponentReceipt } from '@exactjs/core/runtime/component-operations';
import type { IntlRuntimeDescriptorV1 } from './contracts.js';
import { canonicalizeIntlValue } from './canonical.js';
import { createIntlEnvironment } from './environment.js';
import { prepareIntlActivation } from './prepared.js';
import { renderIntlActivation } from './render.js';
import { registerIntlArtifacts } from './artifacts.js';
import { validateIntlCatalog, validateIntlRuntimeDescriptor } from './validation.js';
import { validateIntlPackageMetadata } from './package-metadata.js';
import { measurementDescriptor } from './test-support/measurement-descriptor.js';
import { strongStructure } from './intl.fixtures.js';

const messageKey = '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU';
const descriptor: IntlRuntimeDescriptorV1 = {
	protocol: 1,
	owner: 'example',
	occurrenceId: 'Greeting:0',
	contract: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
	key: messageKey,
	sourceLocale: 'en-US',
	target: { kind: 'content' },
	bindings: [
		{ index: 0, kind: 'value', type: 'string', name: 'name' },
		{ index: 1, kind: 'selector', type: 'number', name: 'count' },
		{ index: 2, kind: 'element', type: 'structure', name: 'strong', exactlyOnce: true }
	],
	source: [
		{ kind: 'text', value: 'Hello ' },
		{ kind: 'value', binding: 0 },
		{ kind: 'text', value: '. ' },
		{
			kind: 'select',
			binding: 1,
			selection: 'plural-cardinal',
			cases: [{ key: '=1', value: [{ kind: 'text', value: 'One message' }] }],
			fallback: [
				{ kind: 'value', binding: 1 },
				{ kind: 'text', value: ' messages' }
			]
		},
		{ kind: 'text', value: ' in ' },
		{ kind: 'element', binding: 2, value: [{ kind: 'text', value: 'inbox' }] }
	],
	capabilities: ['plural-cardinal', 'element']
};

describe('intl protocol', () => {
	it('validates closed published-package metadata and bounded export subpaths', () => {
		expect(
			validateIntlPackageMetadata({
				protocol: 1,
				sourceLocale: 'en-us',
				sourceUnits: { 'length/road': 'mile' },
				messages: './intl/messages',
				catalogs: { fr: './intl/fr' }
			})
		).toEqual({
			protocol: 1,
			sourceLocale: 'en-US',
			sourceUnits: { 'length/road': 'mile' },
			messages: './intl/messages',
			catalogs: { fr: './intl/fr' }
		});
		expect(() =>
			validateIntlPackageMetadata({
				protocol: 1,
				sourceLocale: 'en-US',
				messages: '../private/messages'
			})
		).toThrow('public package export subpath');
	});
	it('creates stable canonical source values', () => {
		expect(canonicalizeIntlValue({ z: 'e\u0301', a: -0 })).toBe('{"a":0,"z":"é"}');
	});

	it('rejects catalog operations outside the owning descriptor contract', () => {
		const validated = validateIntlRuntimeDescriptor(descriptor);
		expect(() =>
			validateIntlCatalog(
				{ protocol: 1, locale: 'fr', owner: 'example', messages: { unknown: [] } },
				[validated]
			)
		).toThrow('unknown message');
	});

	it('rejects execution-shaped catalog nodes instead of migrating them', () => {
		const scalarDescriptor: IntlRuntimeDescriptorV1 = {
			...descriptor,
			bindings: [descriptor.bindings[0]!],
			source: [{ kind: 'value', binding: 0 }],
			capabilities: []
		};
		expect(() =>
			validateIntlCatalog(
				{
					protocol: 1,
					locale: 'fr',
					owner: 'example',
					messages: {
						[messageKey]: [
							{ kind: 'format', bindings: [0], formatter: { kind: 'number', options: {} } }
						]
					}
				},
				[scalarDescriptor]
			)
		).toThrow('.id must be a nonempty string');
	});

	it('uses a selected language catalog for a regional target locale', () => {
		const translated = [{ kind: 'text' as const, value: 'Bonjour' }];
		const regionalDescriptor: IntlRuntimeDescriptorV1 = {
			...descriptor,
			bindings: [],
			source: [{ kind: 'text', value: 'Hello' }],
			capabilities: []
		};
		const environment = createIntlEnvironment({
			locale: 'fr-CA',
			descriptors: [regionalDescriptor],
			catalogs: [
				{
					protocol: 1,
					locale: 'fr',
					owner: regionalDescriptor.owner,
					messages: { [messageKey]: translated }
				}
			]
		});
		expect(environment.find(regionalDescriptor.owner, messageKey)).toEqual(translated);
	});

	it('adopts a lazy descriptor and catalog registered after environment creation', () => {
		const lazyKey = messageKey;
		const lazyDescriptor: IntlRuntimeDescriptorV1 = {
			...descriptor,
			owner: 'lazy-example',
			occurrenceId: 'Lazy:0',
			key: lazyKey,
			bindings: [],
			source: [{ kind: 'text', value: 'Lazy fallback' }],
			capabilities: []
		};
		const environment = createIntlEnvironment({ locale: 'fr' });
		registerIntlArtifacts(
			'virtual:lazy-intl-test',
			1,
			[lazyDescriptor],
			[
				{
					protocol: 1,
					locale: 'fr',
					owner: lazyDescriptor.owner,
					messages: { [lazyKey]: [{ kind: 'text', value: 'ChargÃ© tardivement' }] }
				}
			]
		);
		expect(environment.find(lazyDescriptor.owner, lazyKey)).toEqual([
			{ kind: 'text', value: 'ChargÃ© tardivement' }
		]);
		registerIntlArtifacts(
			'virtual:lazy-intl-test',
			2,
			[lazyDescriptor],
			[
				{
					protocol: 1,
					locale: 'fr',
					owner: lazyDescriptor.owner,
					messages: {}
				}
			]
		);
		expect(environment.find(lazyDescriptor.owner, lazyKey)).toBeUndefined();
	});

	it('renders reordered translations with scalar and movable intrinsic bindings', () => {
		const catalog = {
			protocol: 1,
			locale: 'fr-FR',
			owner: 'example',
			messages: {
				[messageKey]: [
					{ kind: 'element', id: 'n5', value: [{ kind: 'text', value: 'boîte' }] },
					{ kind: 'text', value: ' : ' },
					{ kind: 'placeholder', id: 'n1' },
					{ kind: 'text', value: ', ' },
					{
						kind: 'select',
						id: 'n3',
						cases: [{ key: '=1', value: [{ kind: 'text', value: 'un message' }] }],
						fallback: [
							{ kind: 'placeholder', id: 'n3.f.0' },
							{ kind: 'text', value: ' messages' }
						]
					}
				]
			}
		};
		const environment = createIntlEnvironment({
			locale: 'fr-FR',
			descriptors: [descriptor],
			catalogs: [catalog]
		});
		const activation = prepareIntlActivation(descriptor, ['Ada', 1], [strongStructure]);
		const output = renderIntlActivation(activation, environment);
		const receipt = readCompiledComponentReceipt(output[0]);
		expect(receipt).toBeDefined();
		expect(unwrap(receipt!.children[0])).toEqual(['boîte']);
		expect(output.slice(1)).toEqual([' : ', 'Ada', ', ', 'un message']);
	});

	it('renders plural-range branches with the target locale range rules', () => {
		const rangeDescriptor: IntlRuntimeDescriptorV1 = {
			...descriptor,
			key: messageKey,
			bindings: [
				{ index: 0, kind: 'selector', type: 'number' },
				{ index: 1, kind: 'selector', type: 'number' }
			],
			source: [
				{
					kind: 'select',
					binding: 0,
					rangeBinding: 1,
					selection: 'plural-range-cardinal',
					cases: [{ key: 'two', value: [{ kind: 'text', value: 'dual range' }] }],
					fallback: [{ kind: 'text', value: 'other range' }]
				}
			],
			capabilities: ['plural-range-cardinal']
		};
		const environment = createIntlEnvironment({
			locale: 'sl-SI',
			descriptors: [rangeDescriptor]
		});

		expect(
			renderIntlActivation(prepareIntlActivation(rangeDescriptor, [1, 2]), environment)
		).toEqual(['dual range']);
		expect(() =>
			validateIntlRuntimeDescriptor({
				...rangeDescriptor,
				source: [{ ...rangeDescriptor.source[0], rangeBinding: undefined }]
			})
		).toThrow('rangeBinding');
	});

	it('merges library, application, and override catalogs with deterministic precedence', () => {
		const catalog = (value: string) => ({
			protocol: 1,
			locale: 'fr-FR',
			owner: descriptor.owner,
			messages: {
				[descriptor.key]: [
					{ kind: 'element', id: 'n5', value: [{ kind: 'text', value: 'boîte' }] },
					{ kind: 'text', value },
					{ kind: 'placeholder', id: 'n1' },
					{
						kind: 'select',
						id: 'n3',
						cases: [],
						fallback: [{ kind: 'text', value: 'messages' }]
					}
				]
			}
		});
		const environment = createIntlEnvironment({
			locale: 'fr-FR',
			descriptors: [descriptor],
			catalogs: [],
			catalogLayers: [
				{ kind: 'override', catalog: catalog('override:') },
				{ kind: 'library', catalog: catalog('library:') },
				{ kind: 'application', catalog: catalog('application:') }
			]
		});
		const output = renderIntlActivation(
			prepareIntlActivation(descriptor, ['Ada', 2], [strongStructure]),
			environment
		);
		expect(output[1]).toBe('override:');
	});

	it('provides structural pseudo-locales and reports missing targets once', () => {
		const missing: unknown[] = [];
		const pseudo = createIntlEnvironment({
			locale: 'en-XA',
			descriptors: [descriptor],
			catalogs: []
		});
		const output = renderIntlActivation(
			prepareIntlActivation(descriptor, ['Ada', 1], [strongStructure]),
			pseudo
		);
		expect(output.some((value) => typeof value === 'string' && value.includes('~'))).toBe(true);

		const fallback = createIntlEnvironment({
			locale: 'de-DE',
			descriptors: [descriptor],
			catalogs: [],
			onMissingMessage: (message) => missing.push(message)
		});
		const activation = prepareIntlActivation(descriptor, ['Ada', 1], [strongStructure]);
		renderIntlActivation(activation, fallback);
		renderIntlActivation(activation, fallback);
		expect(missing).toEqual([
			expect.objectContaining({ locale: 'de-DE', owner: 'example', sourceLocale: 'en-US' })
		]);
	});

	it('rejects translator data that duplicates structural output before rendering', () => {
		const catalog = {
			protocol: 1,
			locale: 'de',
			owner: 'example',
			messages: {
				[messageKey]: [
					{ kind: 'element', id: 'n5', value: [{ kind: 'text', value: 'eins' }] },
					{ kind: 'element', id: 'n5', value: [{ kind: 'text', value: 'zwei' }] }
				]
			}
		};
		expect(() =>
			createIntlEnvironment({ locale: 'de', descriptors: [descriptor], catalogs: [catalog] })
		).toThrow('exactly once');
	});

	it('discovers generated artifacts and fences stale companion generations', () => {
		const generatedDescriptor: IntlRuntimeDescriptorV1 = {
			protocol: 1,
			owner: 'generated-example',
			occurrenceId: 'Generated:0',
			contract: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
			key: messageKey,
			sourceLocale: 'en-US',
			target: { kind: 'content' },
			bindings: [],
			source: [{ kind: 'text', value: 'Hello' }],
			capabilities: []
		};
		const catalog = (value: string) => ({
			protocol: 1,
			locale: 'fr',
			owner: generatedDescriptor.owner,
			messages: { [generatedDescriptor.key]: [{ kind: 'text', value }] }
		});
		registerIntlArtifacts('virtual:test/generated', 2, [generatedDescriptor], [catalog('Bonjour')]);
		registerIntlArtifacts('virtual:test/generated', 1, [generatedDescriptor], [catalog('Périmé')]);
		const environment = createIntlEnvironment({ locale: 'fr' });
		const activation = prepareIntlActivation(generatedDescriptor, []);
		expect(renderIntlActivation(activation, environment)).toEqual(['Bonjour']);
	});

	it('formats compact relative-duration projections from one structured binding', () => {
		const relativeDescriptor: IntlRuntimeDescriptorV1 = {
			protocol: 1,
			owner: 'timing',
			occurrenceId: 'Timing:0',
			contract: 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
			key: messageKey,
			sourceLocale: 'en-US',
			target: { kind: 'content' },
			bindings: [{ index: 0, kind: 'value', type: 'temporal-duration' }],
			source: [
				{
					kind: 'format',
					bindings: [0],
					formatter: {
						kind: 'relative-duration',
						fields: ['years', 'months', 'days'],
						zero: 'just now',
						options: { numeric: 'always' }
					}
				}
			],
			capabilities: ['relative-duration']
		};
		const environment = createIntlEnvironment({
			locale: 'en-US',
			descriptors: [relativeDescriptor],
			catalogs: []
		});

		expect(
			renderIntlActivation(
				prepareIntlActivation(relativeDescriptor, [{ years: 0, months: 5, days: 2 }]),
				environment
			)
		).toEqual(['5 months ago']);
		expect(
			renderIntlActivation(
				prepareIntlActivation(relativeDescriptor, [{ years: 0, months: 0, days: 0 }]),
				environment
			)
		).toEqual(['just now']);
	});

	it('formats and converts semantic unit ranges with one visible unit', () => {
		const unitDescriptor: IntlRuntimeDescriptorV1 = {
			protocol: 1,
			owner: 'measurements',
			occurrenceId: 'Distance:0',
			contract: 'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
			key: messageKey,
			sourceLocale: 'en-US',
			target: { kind: 'content' },
			bindings: [
				{ index: 0, kind: 'value', type: 'measurement' },
				{ index: 1, kind: 'value', type: 'measurement' }
			],
			source: [
				{
					kind: 'format',
					bindings: [0, 1],
					formatter: {
						kind: 'unit',
						quantity: 'length',
						usage: 'road',
						sourceUnit: 'mile',
						convertTo: 'kilometer',
						options: { unitDisplay: 'long', maximumFractionDigits: 1 }
					}
				}
			],
			capabilities: ['unit']
		};
		const environment = createIntlEnvironment({
			locale: 'en-US',
			descriptors: [unitDescriptor],
			catalogs: []
		});

		expect(
			renderIntlActivation(prepareIntlActivation(unitDescriptor, [1, 2]), environment)
		).toEqual(['1.6–3.2 kilometers']);
	});

	it('applies locale unit preferences when no fixed convert-to override exists', () => {
		const unitDescriptor = measurementDescriptor('length', 'road', 'mile', {
			unitDisplay: 'long',
			maximumFractionDigits: 1
		});
		const environment = createIntlEnvironment({
			locale: 'de-DE',
			descriptors: [unitDescriptor],
			catalogs: []
		});

		expect(
			String(renderIntlActivation(prepareIntlActivation(unitDescriptor, [1]), environment)[0])
		).toMatch(/1,6\sKilometer/u);
	});

	it('preserves source-visible precision after multiplicative and offset conversion', () => {
		const distance = {
			...measurementDescriptor('length', 'road', 'mile', { unitDisplay: 'long' }),
			bindings: [
				{ index: 0, kind: 'value', type: 'measurement' },
				{ index: 1, kind: 'value', type: 'measurement' }
			] as const,
			source: [
				{
					kind: 'format' as const,
					bindings: [0, 1],
					formatter: {
						kind: 'unit' as const,
						quantity: 'length',
						usage: 'road',
						sourceUnit: 'mile',
						precision: 'source' as const,
						options: { unitDisplay: 'long' }
					}
				}
			]
		};
		const temperature = measurementDescriptor('temperature', 'weather', 'fahrenheit', {
			unitDisplay: 'short'
		});
		const environment = createIntlEnvironment({
			locale: 'en-US',
			descriptors: [distance, temperature],
			catalogs: [],
			unitPreferences: {
				'length/road': 'kilometer',
				'temperature/weather': 'celsius'
			}
		});

		expect(renderIntlActivation(prepareIntlActivation(distance, [12, 18]), environment)).toEqual([
			'19–29 kilometers'
		]);
		expect(
			String(renderIntlActivation(prepareIntlActivation(temperature, [72]), environment)[0])
		).toMatch(/^22\s?°C$/u);
		expect(
			String(renderIntlActivation(prepareIntlActivation(distance, [12.5, 18]), environment)[0])
		).toBe('20.1–29 kilometers');
	});

	it('supports mixed application unit preferences and offset conversions', () => {
		const height = measurementDescriptor('length', 'person-height', 'centimeter', {
			unitDisplay: 'short',
			maximumFractionDigits: 0
		});
		const temperature = measurementDescriptor('temperature', 'weather', 'celsius', {
			unitDisplay: 'short',
			maximumFractionDigits: 0
		});
		const environment = createIntlEnvironment({
			locale: 'en-US',
			descriptors: [height, temperature],
			catalogs: [],
			unitPreferences: {
				'length/person-height': ['foot', 'inch'],
				'temperature/weather': 'fahrenheit'
			}
		});

		const renderedHeight = String(
			renderIntlActivation(prepareIntlActivation(height, [180]), environment)[0]
		);
		const renderedTemperature = String(
			renderIntlActivation(prepareIntlActivation(temperature, [20]), environment)[0]
		);
		expect(renderedHeight).toContain('5 ft');
		expect(renderedHeight).toContain('11 in');
		expect(renderedTemperature).toContain('68');
		environment.setUnitPreferences({ 'length/person-height': 'centimeter' });
		expect(
			String(renderIntlActivation(prepareIntlActivation(height, [180]), environment)[0])
		).toContain('180 cm');
	});

	it('rejects dimensionally incompatible translated unit destinations', () => {
		const invalid = structuredClone(
			measurementDescriptor('temperature', 'weather', 'celsius', {})
		) as unknown as {
			source: [{ formatter: { convertTo?: string } }];
		};
		invalid.source[0].formatter.convertTo = 'mile';
		expect(() => validateIntlRuntimeDescriptor(invalid)).toThrow('dimensionally incompatible');
	});

	it('uses target-locale ordinal categories supplied by a translated pattern', () => {
		const ordinalDescriptor: IntlRuntimeDescriptorV1 = {
			protocol: 1,
			owner: 'placement',
			occurrenceId: 'Placement:0',
			contract: 'EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',
			key: messageKey,
			sourceLocale: 'en-US',
			target: { kind: 'content' },
			bindings: [{ index: 0, kind: 'selector', type: 'number' }],
			source: [
				{
					kind: 'select',
					binding: 0,
					selection: 'plural-ordinal',
					cases: [],
					fallback: [{ kind: 'text', value: 'th' }]
				}
			],
			capabilities: ['plural-ordinal']
		};
		const catalog = {
			protocol: 1,
			locale: 'en-GB',
			owner: ordinalDescriptor.owner,
			messages: {
				[ordinalDescriptor.key]: [
					{
						kind: 'select',
						id: 'n0',
						cases: [
							{ key: 'one', value: [{ kind: 'text', value: 'st' }] },
							{ key: 'two', value: [{ kind: 'text', value: 'nd' }] },
							{ key: 'few', value: [{ kind: 'text', value: 'rd' }] }
						],
						fallback: [{ kind: 'text', value: 'th' }]
					}
				]
			}
		};
		const environment = createIntlEnvironment({
			locale: 'en-GB',
			descriptors: [ordinalDescriptor],
			catalogs: [catalog]
		});

		expect(
			renderIntlActivation(prepareIntlActivation(ordinalDescriptor, [21]), environment)
		).toEqual(['st']);
	});
});
