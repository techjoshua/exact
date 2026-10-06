import { createIntlEnvironment, type IntlRuntimeDescriptorV1 } from '@exactjs/intl';
import { prepareIntlActivation, renderIntlActivation } from '@exactjs/intl/internal';

const environment = createIntlEnvironment({ locale: 'en-US' });
const base: IntlRuntimeDescriptorV1 = {
	protocol: 1,
	owner: 'intl-projections',
	occurrenceId: 'projection:0',
	contract: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
	key: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
	sourceLocale: 'en-US',
	target: { kind: 'content' },
	bindings: [{ index: 0, kind: 'value', type: 'string' }],
	source: [{ kind: 'value', binding: 0 }],
	capabilities: []
};
const invalidDate: IntlRuntimeDescriptorV1 = {
	...base,
	source: [
		{
			kind: 'format',
			bindings: [0],
			formatter: { kind: 'date-time', temporalKind: 'temporal-instant', options: {} }
		}
	],
	capabilities: ['date-time']
};
const list: IntlRuntimeDescriptorV1 = {
	...base,
	source: [{ kind: 'format', bindings: [0], formatter: { kind: 'list', options: {} } }],
	capabilities: ['list']
};

const unit: IntlRuntimeDescriptorV1 = {
	...base,
	source: [
		{
			kind: 'format',
			bindings: [0],
			formatter: {
				kind: 'unit',
				quantity: 'unit',
				usage: 'default',
				sourceUnit: 'degree',
				options: {}
			}
		}
	],
	capabilities: ['unit']
};

/** Exercises prepared native value semantics beside compiled prototype formatting.
 * @exact pure
 */
export function projectedLabel(step: number): string {
	const values = ['first', 'second'];
	values[Symbol.iterator] = () => [`selected ${step}`][Symbol.iterator]();
	return [
		renderIntlActivation(
			prepareIntlActivation(invalidDate, [new Date(Number.NaN)]),
			environment
		).join(''),
		renderIntlActivation(prepareIntlActivation(list, [values]), environment).join(''),
		...[Number.NaN, Number.POSITIVE_INFINITY, 9007199254740993n + BigInt(step)].map((value) =>
			renderIntlActivation(prepareIntlActivation(unit, [value]), environment).join('')
		)
	].join(' / ');
}

class ProjectionDate extends Date {
	override getTime(): number {
		return Number.NaN;
	}
}

/** Supplies a native Date whose overridden method must not replace its internal value.
 * @exact pure
 */
export function projectionDate(step: number): Date {
	return new ProjectionDate(Date.UTC(2024, 2, 2 + step, 15, 4, 5));
}
