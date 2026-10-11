/// <reference lib="es2023.intl" />
import { expect, it } from 'vitest';
import type { IntlFormatterV1, IntlRuntimeDescriptorV1 } from './contracts.js';
import { createIntlEnvironment } from './environment.js';
import { prepareIntlActivation } from './prepared.js';
import { renderIntlActivation } from './render.js';

// Both scalar and range forms share the native numeric formatter. Projection must not
// discard the second endpoint or replace equal/rounded range results with scalar output.
it.each(['number', 'currency'] as const)('retains native %s scalar and range semantics', (kind) => {
	const formatter: IntlFormatterV1 =
		kind === 'number'
			? { kind, options: { maximumFractionDigits: 0 } }
			: { kind, currency: 'USD', display: 'code', options: { maximumFractionDigits: 0 } };
	for (const locale of ['en-US', 'de-DE', 'fr-FR'] as const) {
		const environment = createIntlEnvironment({ locale });
		const native = new Intl.NumberFormat(locale, {
			maximumFractionDigits: 0,
			...(kind === 'currency'
				? ({ style: 'currency', currency: 'USD', currencyDisplay: 'code' } as const)
				: {})
		});
		for (const values of [[1], [1, 1], [1, 2], [1.1, 1.2], [-3, 7], [10, 2], [NaN, 2]]) {
			const descriptor: IntlRuntimeDescriptorV1 = {
				protocol: 1,
				owner: 'numeric-ranges',
				occurrenceId: 'range:0',
				contract: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
				key: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
				sourceLocale: 'en-US',
				target: { kind: 'content' },
				bindings: values.map((_, index) => ({ index, kind: 'value', type: 'number' })),
				source: [{ kind: 'format', bindings: values.map((_, index) => index), formatter }],
				capabilities: [kind]
			};
			const actual = () =>
				renderIntlActivation(prepareIntlActivation(descriptor, values), environment).join('');
			const expected = () =>
				values.length === 2
					? native.formatRange(values[0]!, values[1]!)
					: native.format(values[0]!);
			if (values.length === 2 && Number.isNaN(values[0])) {
				expect(expected).toThrow(RangeError);
				expect(actual).toThrow(RangeError);
			} else expect(actual()).toBe(expected());
		}
	}
});

it('requires native range support while preserving scalar formatting on older platforms', () => {
	const previous = Object.getOwnPropertyDescriptor(Intl.NumberFormat.prototype, 'formatRange')!;
	Object.defineProperty(Intl.NumberFormat.prototype, 'formatRange', {
		value: undefined,
		configurable: true
	});
	try {
		const descriptor: IntlRuntimeDescriptorV1 = {
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
		const environment = createIntlEnvironment({ locale: 'en-US' });
		expect(() =>
			renderIntlActivation(prepareIntlActivation(descriptor, [1, 2]), environment)
		).toThrow('Intl.NumberFormat.formatRange() is unavailable');
		const scalar = {
			...descriptor,
			source: [{ kind: 'format', bindings: [0], formatter: { kind: 'number', options: {} } }]
		} as const;
		expect(renderIntlActivation(prepareIntlActivation(scalar, [1, 2]), environment)).toEqual(['1']);
	} finally {
		Object.defineProperty(Intl.NumberFormat.prototype, 'formatRange', previous);
	}
});
