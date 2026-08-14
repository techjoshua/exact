import { describe, expect, it } from 'vitest';
import { analyzeIntlSource } from './index.js';

describe('expanded semantic unit analysis', () => {
	it('preserves formatter semantics across intrinsic and fragment authoring', () => {
		const analyze = (content: string) =>
			analyzeIntlSource(`export function Distance(value: number) { return () => ${content}; }`, {
				filename: '/src/Distance.tsx',
				owner: 'example',
				sourceLocale: 'en-US'
			});
		const intrinsic = analyze('<output intl:unit="distance-road">{value} miles</output>');
		const fragment = analyze('<_ intl:unit="distance-road">{value} miles</_>');

		expect(intrinsic.diagnostics).toEqual([]);
		expect(fragment.diagnostics).toEqual([]);
		const { sourceRange: intrinsicRange, ...intrinsicContract } = intrinsic.descriptors[0]!;
		const { sourceRange: fragmentRange, ...fragmentContract } = fragment.descriptors[0]!;
		expect(fragmentContract).toEqual(intrinsicContract);
		expect(intrinsicRange.length).toBeGreaterThan(0);
		expect(fragmentRange.length).toBeGreaterThan(0);
	});

	it.each([
		['area-land', 'acres', 'area', 'land', 'acre'],
		['mass-person', 'pounds', 'mass', 'person', 'pound'],
		['volume-liquid', 'gallons', 'volume', 'liquid', 'gallon'],
		['speed-road', 'mph', 'speed', 'road', 'mile-per-hour'],
		['pressure-weather', 'inHg', 'pressure', 'weather', 'inch-of-mercury'],
		['energy-food', 'kcal', 'energy', 'food', 'kilocalorie'],
		['energy-electricity', 'kWh', 'energy', 'electricity', 'kilowatt-hour'],
		['power-engine', 'hp', 'power', 'engine', 'horsepower'],
		['fuel-economy-road', 'mpg', 'fuel-economy', 'road', 'mile-per-gallon'],
		['digital-storage', 'GB', 'digital', 'storage', 'gigabyte']
	] as const)(
		'infers %s intent independently from its %s fallback unit',
		(semantic, label, quantity, usage, sourceUnit) => {
			const result = analyzeIntlSource(
				`export function Measurement(value: number) { return () =>
					<output intl:unit="${semantic}">{value} ${label}</output>;
				}`,
				{ filename: `/src/${semantic}.tsx`, owner: 'example', sourceLocale: 'en-US' }
			);

			expect(result.diagnostics).toEqual([]);
			expect(result.descriptors[0]?.source).toEqual([
				expect.objectContaining({
					kind: 'format',
					formatter: expect.objectContaining({ quantity, usage, sourceUnit })
				})
			]);
		}
	);

	it('keeps case-significant digital symbols distinct', () => {
		const megabits = analyzeIntlSource(
			'export function Rate(value: number) { return () => <output intl:unit="digital">{value} Mb</output>; }',
			{ filename: '/src/Megabits.tsx', owner: 'example', sourceLocale: 'en-US' }
		);
		const megabytes = analyzeIntlSource(
			'export function Size(value: number) { return () => <output intl:unit="digital">{value} MB</output>; }',
			{ filename: '/src/Megabytes.tsx', owner: 'example', sourceLocale: 'en-US' }
		);

		expect(megabits.descriptors[0]?.source).toEqual([
			expect.objectContaining({
				formatter: expect.objectContaining({ sourceUnit: 'megabit' })
			})
		]);
		expect(megabytes.descriptors[0]?.source).toEqual([
			expect.objectContaining({
				formatter: expect.objectContaining({ sourceUnit: 'megabyte' })
			})
		]);
	});
});
