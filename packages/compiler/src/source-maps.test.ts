import { describe, expect, it } from 'vitest';
import { composeExactSourceMaps } from './source-maps.js';

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
});
