import type { IntlRuntimeDescriptorV1 } from '../contracts.js';

const fixtureMessageKey = '47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU';

/** Creates one semantic-unit descriptor for runtime conversion tests. */
export function measurementDescriptor(
	quantity: string,
	usage: string,
	sourceUnit: string,
	options: Readonly<Record<string, string | number | boolean>>
): IntlRuntimeDescriptorV1 {
	return {
		protocol: 1,
		owner: `measurements-${quantity}-${usage}`,
		occurrenceId: `${quantity}:${usage}`,
		contract: `${quantity}-${usage}-${sourceUnit}`.padEnd(43, 'x').slice(0, 43),
		key: fixtureMessageKey,
		sourceLocale: 'en-US',
		target: { kind: 'content' },
		bindings: [{ index: 0, kind: 'value', type: 'measurement' }],
		source: [
			{
				kind: 'format',
				bindings: [0],
				formatter: { kind: 'unit', quantity, usage, sourceUnit, precision: 'source', options }
			}
		],
		capabilities: ['unit']
	};
}
