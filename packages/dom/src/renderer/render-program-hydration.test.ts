/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
	claimProgramChildSlot,
	claimProgramTextSlot,
	indexProgramHydration,
	programElement
} from './render-program-hydration.js';
import type { ExactRenderProgram } from '@exactjs/core/runtime/render';
import {
	beginCompiledProgramClaims,
	claimCompiledProgramText,
	claimCompiledRenderProgram
} from './render-program-claims.js';

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

describe('compiler-wired render-program claims', () => {
	const scalarProgram: ExactRenderProgram = {
		version: 3,
		id: 'direct-scalar',
		namespace: 'html',
		template: '<p><!---->\ue000exact:0\ue001<!----></p>',
		slots: [['text', 'label', [1]]],
		nodes: [[0, 'p']],
		directClaims: true,
		bind(target) {
			if (!beginCompiledProgramClaims(target, 'p', 'html')) return;
			claimCompiledProgramText(target, 0, 0, 'label');
		}
	};

	it('claims compiler template sentinels for later client-created regions', () => {
		const template = document.createElement('template');
		template.innerHTML = scalarProgram.template;
		const root = template.content.firstElementChild as Element;

		const claimed = claimCompiledRenderProgram(scalarProgram, root, 'template');

		expect((claimed?.slotNodes[0] as Text).data).toBe('\ue000exact:0\ue001');
		expect(root.childNodes).toHaveLength(1);
	});

	it('claims identity sentinels from server-rendered regions', () => {
		const root = document.createElement('p');
		root.innerHTML = '<!--exact:dynamic:label-->Ready<!--/exact:dynamic:label-->';

		const claimed = claimCompiledRenderProgram(scalarProgram, root, 'ssr');

		expect((claimed?.slotNodes[0] as Text).data).toBe('Ready');
		expect(root.childNodes).toHaveLength(1);
	});
});
