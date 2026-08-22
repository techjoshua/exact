/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
	claimProgramChildSlot,
	claimProgramTextSlot,
	indexProgramHydration,
	programElement
} from './render-program-hydration.js';

describe('compiled render-program hydration index', () => {
	it('addresses dense compiler nodes without materializing legacy identity maps', () => {
		const root = document.createElement('main');
		root.innerHTML = '<section><button>Save</button></section>';

		const index = indexProgramHydration(root);

		expect(index.elements).toEqual([
			root,
			root.querySelector('section'),
			root.querySelector('button')
		]);
		expect(programElement(index, 2)).toBe(root.querySelector('button'));
		expect(index.legacyElements).toBeUndefined();
		expect(index.markers).toBeUndefined();
	});

	it('retains legacy identities and structural markers only when present', () => {
		const root = document.createElement('main');
		root.innerHTML =
			'<section data-exact-id="legacy"><!--exact:dynamic:slot--><span>value</span><!--/exact:dynamic:slot--></section>';

		const index = indexProgramHydration(root);

		expect(programElement(index, 'legacy')).toBe(root.firstElementChild);
		expect(claimProgramChildSlot(index, 'slot')?.data).toBe('exact:dynamic:slot');
	});

	it('releases scalar marker pairs after transferring ownership to the text node', () => {
		const root = document.createElement('main');
		root.innerHTML = '<!--exact:dynamic:label-->Ready<!--/exact:dynamic:label-->';
		const index = indexProgramHydration(root);

		const text = claimProgramTextSlot(root, index, 'label');

		expect(text?.data).toBe('Ready');
		expect(root.childNodes).toHaveLength(1);
		expect(root.firstChild).toBe(text);
	});
});
