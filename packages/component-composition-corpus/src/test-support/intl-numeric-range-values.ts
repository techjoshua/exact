import { createIntlEnvironment, type IntlRuntimeDescriptorV1 } from '@exactjs/intl';
import { prepareIntlActivation, renderIntlActivation } from '@exactjs/intl/internal';

const environment = createIntlEnvironment({ locale: 'en-US' });
const numberRange: IntlRuntimeDescriptorV1 = {
	protocol: 1,
	owner: 'numeric-ranges',
	occurrenceId: 'range:0',
	contract: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
	key: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
	sourceLocale: 'en-US',
	target: { kind: 'content' },
	bindings: [
		{ index: 0, kind: 'value', type: 'number' },
		{ index: 1, kind: 'value', type: 'number' }
	],
	source: [{ kind: 'format', bindings: [0, 1], formatter: { kind: 'number', options: {} } }],
	capabilities: ['number']
};
const currencyRange: IntlRuntimeDescriptorV1 = {
	...numberRange,
	source: [
		{
			kind: 'format',
			bindings: [0, 1],
			formatter: { kind: 'currency', currency: 'USD', display: 'code', options: {} }
		}
	],
	capabilities: ['currency']
};

/** Formats both numeric range projections from their existing protocol bindings.
 * @exact pure
 */
export function rangeLabel(start: number, end: number) {
	return [numberRange, currencyRange]
		.map((descriptor) =>
			renderIntlActivation(prepareIntlActivation(descriptor, [start, end]), environment).join('')
		)
		.join(' / ');
}
