import { describe, expect, it } from 'vitest';
import { analyzeIntlSource } from './index.js';

describe('expanded semantic unit analysis', () => {
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
					<_ intl:unit="${semantic}">{value} ${label}</_>;
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
			'export function Rate(value: number) { return () => <_ intl:unit="digital">{value} Mb</_>; }',
			{ filename: '/src/Megabits.tsx', owner: 'example', sourceLocale: 'en-US' }
		);
		const megabytes = analyzeIntlSource(
			'export function Size(value: number) { return () => <_ intl:unit="digital">{value} MB</_>; }',
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
