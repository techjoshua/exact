import { reactive } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import type { IntlRuntimeDescriptorV1 } from './contracts.js';
import { createIntlEnvironment } from './environment.js';
import { prepareIntlActivation } from './prepared.js';
import {
	publishIntlScalarPresentation,
	type IntlScalarPresentation
} from './scalar-presentation.js';

const key = '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU';
const descriptor: IntlRuntimeDescriptorV1 = {
	protocol: 1,
	owner: 'chart-labels',
	occurrenceId: 'SeriesLabel:0',
	contract: 'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS',
	key,
	sourceLocale: 'en-US',
	target: { kind: 'content' },
	bindings: [],
	source: [{ kind: 'text', value: 'Outside temperature' }],
	capabilities: []
};

describe('scalar intl presentation', () => {
	it('publishes the active translation and retains the authored source fallback', () => {
		const environment = createIntlEnvironment({
			locale: 'fr-FR',
			descriptors: [descriptor],
			catalogs: [
				{
					protocol: 1,
					locale: 'fr-FR',
					owner: descriptor.owner,
					messages: { [key]: [{ kind: 'text', value: 'Température extérieure' }] }
				}
			]
		});
		const consumer = reactive<{ presentation?: IntlScalarPresentation }>({});

		const release = publishIntlScalarPresentation(
			{ message: prepareIntlActivation(descriptor, []) },
			environment,
			consumer
		);
		const presentation = consumer.presentation;
		expect(presentation?.value).toBe('Température extérieure');
		expect(presentation?.source).toBe('Outside temperature');
		expect(presentation?.locale).toBe('fr-FR');
		expect(presentation?.direction).toBe('ltr');

		environment.setLocale('ar-EG');
		expect(presentation?.value).toBe('Outside temperature');
		expect(presentation?.source).toBe('Outside temperature');
		expect(presentation?.direction).toBe('rtl');
		release?.();
		expect(consumer.presentation).toBeUndefined();
	});

	it('rejects structural activations instead of flattening component output', () => {
		const structural: IntlRuntimeDescriptorV1 = {
			...descriptor,
			occurrenceId: 'SeriesLabel:1',
			contract: 'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
			bindings: [{ index: 0, kind: 'element', type: 'structure', exactlyOnce: true }],
			source: [{ kind: 'element', binding: 0, value: [{ kind: 'text', value: 'Outside' }] }],
			capabilities: ['element']
		};
		const environment = createIntlEnvironment({ locale: 'en-US', descriptors: [structural] });
		const activation = prepareIntlActivation(structural, [], [() => 'Outside']);

		expect(() =>
			publishIntlScalarPresentation({ message: activation }, environment, reactive({}))
		).toThrow('containing structure');
	});

	it('leaves authored source fallback alone when analysis did not prepare an activation', () => {
		const consumer = reactive<{ presentation?: IntlScalarPresentation }>({});
		expect(
			publishIntlScalarPresentation(
				{ message: true },
				createIntlEnvironment({ locale: 'en-US' }),
				consumer
			)
		).toBeUndefined();
		expect(consumer.presentation).toBeUndefined();
	});
});
