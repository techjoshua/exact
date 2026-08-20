import { describe, expect, it } from 'vitest';
import {
	composeExactSourceMaps,
	createGeneratedSuffixSourceMap,
	createTokenSourceMap
} from './source-maps.js';
import { transformSource } from './compilation/transformation.js';

describe('source-map composition', () => {
	it('retains post-transform columns and original symbol names', () => {
		const map = composeExactSourceMaps(
			{
				version: 3,
				sources: ['compiled.js'],
				sourcesContent: ['value'],
				names: ['transformedValue'],
				mappings: 'GAAAA'
			},
			{
				version: 3,
				sources: ['source.tsx'],
				sourcesContent: ['value'],
				names: ['sourceValue'],
				mappings: 'AAAAA'
			}
		);

		expect(map.sources).toEqual(['source.tsx']);
		expect(map.sourcesContent).toEqual(['value']);
		expect(map.mappings.startsWith('G')).toBe(true);
		expect(map.names).toContain('sourceValue');
	});

	it('leaves generated prefix lines unmapped while preserving source positions', () => {
		const map = createGeneratedSuffixSourceMap(
			'compiled.js',
			'const first = 1;\nconst second = 2;',
			'import "generated";\nconst first = 1;\nconst second = 2;'
		);

		expect(map.mappings).toBe(';AAAA;AACA');
		expect(map.sourcesContent).toEqual(['const first = 1;\nconst second = 2;']);
	});

	it('tracks unchanged tokens when generated lines and columns drift', () => {
		const map = createTokenSourceMap(
			'value.ts',
			'const value = first + second;',
			'/* generated */\nconst value =\n  first + second;'
		);

		expect(map.mappings.split(';')).toHaveLength(3);
		expect(map.mappings.split(';')[0]).toBe('');
		expect(map.mappings.split(';')[2]).toContain(',');
	});

	it('rejects a host rewrite without a composable source map', () => {
		expect(() =>
			transformSource('export const value = 1;', {
				filename: '/app/value.ts',
				sourceMap: true,
				moduleTransform: ({ source }) => ({ code: `/* rewritten */\n${source}` })
			})
		).toThrow('without returning a valid version 3 source map');
	});

	it('retains the native map when a host transform does not change code', () => {
		const result = transformSource('export const value = 1;', {
			filename: '/app/value.ts',
			sourceMap: true,
			moduleTransform: ({ source }) => ({ code: source })
		});

		expect(result.map?.sources).toEqual(['/app/value.ts']);
		expect(result.map?.sourcesContent).toEqual(['export const value = 1;']);
	});
});
