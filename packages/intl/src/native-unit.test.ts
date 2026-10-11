import { expect, it } from 'vitest';
import { createIntlEnvironment } from './environment.js';
import { prepareIntlActivation } from './prepared.js';
import { renderIntlActivation } from './render.js';
import { validateIntlRuntimeDescriptor } from './validation.js';
import { measurementDescriptor } from './test-support/measurement-descriptor.js';

it.each(['mile', 'degree', 'meter-per-second'])(
	'retains native numeric and range semantics for %s',
	(unit) => {
		const descriptor = measurementDescriptor('unit', 'default', unit, {});
		const source = descriptor.source[0];
		if (source?.kind !== 'format') throw new Error('invalid fixture');
		const range = {
			...descriptor,
			bindings: [...descriptor.bindings, { ...descriptor.bindings[0]!, index: 1 }],
			source: [{ ...source, bindings: [0, 1] }]
		};
		const environment = createIntlEnvironment({
			locale: 'en-US',
			unitPreferences: { 'length/road': 'kilometer' }
		});
		const native = new Intl.NumberFormat('en-US', { style: 'unit', unit });
		for (const values of [
			[Number.NaN],
			[Number.POSITIVE_INFINITY],
			[9007199254740993n],
			['12'],
			[1, 2],
			[2, 2],
			[9007199254740993n, 9007199254740995n]
		]) {
			expect(
				renderIntlActivation(
					prepareIntlActivation(values.length === 2 ? range : descriptor, values),
					environment
				).join('')
			).toBe(
				values.length === 1
					? native.format(values[0] as number)
					: native.formatRange(values[0] as number, values[1] as number)
			);
		}
		expect(() =>
			renderIntlActivation(prepareIntlActivation(range, [Number.NaN, 2]), environment)
		).toThrow(RangeError);
	}
);

it('keeps semantic conversion distinct from generic native units', () => {
	const descriptor = measurementDescriptor('unit', 'default', 'mile', {});
	const source = descriptor.source[0];
	if (source?.kind !== 'format' || source.formatter.kind !== 'unit')
		throw new Error('invalid fixture');
	const generic = {
		...descriptor,
		source: [{ ...source, formatter: { ...source.formatter, convertTo: 'kilometer' } }]
	};
	expect(() => validateIntlRuntimeDescriptor(generic)).toThrow('incompatible');
	const semantic = measurementDescriptor('length', 'road', 'mile', {});
	expect(() =>
		renderIntlActivation(
			prepareIntlActivation(semantic, [Number.NaN]),
			createIntlEnvironment({ locale: 'en-US' })
		)
	).toThrow();
});
