import { afterAll, describe, expect, it } from 'vitest';
import { NativeIntlAnalyzer } from './native-analysis.js';

const analyzer = new NativeIntlAnalyzer();
afterAll(() => analyzer.dispose());

describe('measurement difference extraction', () => {
	it.each(['difference', 'difference={false}', 'sourceUnit="fahrenheit" convertTo="celsius"'])(
		'consumes unit metadata on reconstructed nested hosts: %s',
		(options) => {
			const source = `export function View(value:number){return()=> <p intl:message>Change <span intl:unit="temperature-weather" ${options}>{value} °F</span></p>;}`;
			const result = analyzer.analyzeSource(source, {
				filename: '/src/NestedUnit.tsx',
				owner: 'example',
				sourceLocale: 'en-US'
			});
			expect(result.diagnostics).toEqual([]);
			expect(result.code).not.toMatch(/<span[^>]*(?:difference|sourceUnit|convertTo)/);
			expect(result.descriptors).toHaveLength(1);
		}
	);

	it.each(['difference', 'difference={true}', 'intl:difference'])(
		'extracts ordered subtraction endpoints for %s',
		(option) => {
			const source = `export function View(current:number,previous:number){return()=> <p intl:unit="fuel-economy-road" ${option}>{current-previous} MPG</p>;}`;
			const result = analyzer.analyzeSource(source, {
				filename: '/src/Difference.tsx',
				owner: 'example',
				sourceLocale: 'en-US'
			});
			expect(result.diagnostics).toEqual([]);
			expect(result.code).toMatch(/\[current,\s*previous\]/);
			expect(result.code).not.toContain(' difference');
			const node = result.descriptors[0]?.source[0];
			expect(node).toMatchObject({
				kind: 'format',
				bindings: [0, 1],
				formatter: { difference: 'endpoints' }
			});
		}
	);
	it('preserves explicit endpoint evaluation order and subtraction orientation', () => {
		const source = `declare function from():number;declare function to():number;export function View(change:number){return()=> <p intl:unit="fuel-economy-road" difference={{from:from(),to:to()}}>{change} MPG</p>;}`;
		const result = analyzer.analyzeSource(source, {
			filename: '/src/Endpoints.tsx',
			owner: 'example',
			sourceLocale: 'en-US'
		});
		expect(result.diagnostics).toEqual([]);
		expect(result.code).toMatch(/\[from\(\),\s*to\(\)\]/);
		expect(result.descriptors[0]?.source[0]).toMatchObject({
			bindings: [1, 0],
			formatter: { difference: 'endpoints' }
		});
	});
	it('explains how to supply hidden nonlinear endpoints', () => {
		const source = `export function View(change:number){return()=> <p intl:unit="fuel-economy-road" difference>{change} MPG</p>;}`;
		const result = analyzer.analyzeSource(source, {
			filename: '/src/Hidden.tsx',
			owner: 'example',
			sourceLocale: 'en-US'
		});
		expect(result.descriptors).toEqual([]);
		expect(result.diagnostics[0]?.message).toContain('both endpoints');
		expect(result.code).toBe(source);
	});
});
