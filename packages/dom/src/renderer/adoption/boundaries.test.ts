/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { closingMarkerIndex } from './boundaries.js';

describe('adoption marker boundaries', () => {
	it('pairs nested anonymous compiler-direct ranges by depth', () => {
		const container = document.createElement('div');
		container.innerHTML = '<!--x--><!--x--><span>nested</span><!--/x--><!--/x-->';
		const nodes = [...container.childNodes];

		expect(closingMarkerIndex(nodes, 0, 'x')).toBe(4);
		expect(closingMarkerIndex(nodes, 1, 'x')).toBe(3);
	});
});
