/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { closingMarkerIndex } from './boundaries.js';

describe('adoption marker boundaries', () => {
	it('pairs nested anonymous compiler-direct ranges by depth', () => {
		const container = document.createElement('div');
		container.innerHTML =
			'<!--exact:dynamic:--><!--exact:dynamic:--><span>nested</span><!--/exact:dynamic:--><!--/exact:dynamic:-->';
		const nodes = [...container.childNodes];

		expect(closingMarkerIndex(nodes, 0, 'exact:dynamic:')).toBe(4);
		expect(closingMarkerIndex(nodes, 1, 'exact:dynamic:')).toBe(3);
	});
});
