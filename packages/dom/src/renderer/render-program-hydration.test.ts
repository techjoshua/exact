/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import {
	claimProgramChildSlot,
	claimProgramTextSlot,
	indexProgramHydration,
	programElement
} from './render-program-hydration.js';
import type {
	ExactRenderProgram,
	ExactRenderProgramBindingTarget
} from '@exactjs/core/runtime/render';
import {
	beginCompiledProgramClaims,
	claimCompiledProgramChild,
	claimCompiledProgramElementPath,
	claimCompiledProgramKeyedChild,
	claimCompiledProgramText,
	claimCompiledRenderProgram
} from './render-program-claims.js';

describe('compiled render-program hydration index', () => {
	it('addresses dense compiler nodes without materializing identity maps', () => {
		const root = document.createElement('main');
		root.innerHTML = '<section><button>Save</button></section>';

		const index = indexProgramHydration(root);

		expect(index.elements).toEqual([
			root,
			root.querySelector('section'),
			root.querySelector('button')
		]);
		expect(programElement(index, 2)).toBe(root.querySelector('button'));
		expect(index.markers).toBeUndefined();
	});

	it('indexes structural markers without authored element identities', () => {
		const root = document.createElement('main');
		root.innerHTML =
			'<section><!--exact:dynamic:slot--><span>value</span><!--/exact:dynamic:slot--></section>';

		const index = indexProgramHydration(root);

		expect(programElement(index, 1)).toBe(root.firstElementChild);
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
		version: 4,
		id: 'direct-scalar',
		namespace: 'html',
		template: '<p><!---->\ue000exact:0\ue001<!----></p>',
		directClaims: true,
		bind(target) {
			if (!beginCompiledProgramClaims(target, 'p', 'html', 1, 1)) return;
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

	it('claims compiler-proven marker-free SSR text without creating delimiters', () => {
		const root = document.createElement('p');
		root.textContent = 'Ready';
		const program: ExactRenderProgram = {
			...scalarProgram,
			bind(target: ExactRenderProgramBindingTarget) {
				if (!beginCompiledProgramClaims(target, 'p', 'html', 1, 1)) return;
				claimCompiledProgramText(target, 0, 0, true);
			}
		};
		const template = document.createElement('template');
		template.innerHTML = program.template;
		const mountedRoot = template.content.firstElementChild as Element;

		const claimed = claimCompiledRenderProgram(program, root, 'ssr');
		const mounted = claimCompiledRenderProgram(program, mountedRoot, 'template');

		expect((claimed?.slotNodes[0] as Text).data).toBe('Ready');
		expect((mounted?.slotNodes[0] as Text).data).toBe('\ue000exact:0\ue001');
		expect(root.childNodes).toHaveLength(1);
		expect(root.querySelectorAll('*')).toHaveLength(0);
	});

	it('claims only a compiler-addressed element target through element-child ordinals', () => {
		const root = document.createElement('main');
		root.innerHTML = '<section><!--variable--><span>Static</span><button>Save</button></section>';
		const program: ExactRenderProgram = {
			version: 4,
			id: 'direct-element-path',
			namespace: 'html',
			template: '<main><section><span>Static</span><button>Save</button></section></main>',
			directClaims: true,
			bind(target: ExactRenderProgramBindingTarget) {
				if (!beginCompiledProgramClaims(target, 'main', 'html', 4, 0)) return;
				// depth 2, followed by element-child ordinals 0 and 1 in base 128.
				claimCompiledProgramElementPath(target, 3, 2 + 1 * 16 * 128, 'button');
			}
		};

		const claimed = claimCompiledRenderProgram(program, root, 'ssr');

		expect(claimed?.elements[3]).toBe(root.querySelector('button'));
		expect(claimed?.elements[1]).toBeUndefined();
		expect(claimed?.elements[2]).toBeUndefined();
	});

	it('claims from a compiler-selected trailing edge after variable structural content', () => {
		const root = document.createElement('section');
		root.innerHTML = '<article>Variable</article><form><textarea></textarea></form>';
		const program: ExactRenderProgram = {
			version: 4,
			id: 'direct-element-reverse-path',
			namespace: 'html',
			template: '<section><form><textarea></textarea></form></section>',
			directClaims: true,
			bind(target: ExactRenderProgramBindingTarget) {
				if (!beginCompiledProgramClaims(target, 'section', 'html', 3, 0)) return;
				// The high bit selects the final element child; textarea is then child zero.
				claimCompiledProgramElementPath(target, 2, 1 + 64 * 16, 'form');
			}
		};

		const claimed = claimCompiledRenderProgram(program, root, 'ssr');

		expect(claimed?.elements[2]).toBe(root.querySelector('form'));
	});

	it('materializes an empty text node at a compiler-proven marker-free boundary', () => {
		const root = document.createElement('p');
		root.innerHTML = '<strong>After</strong>';
		const program: ExactRenderProgram = {
			...scalarProgram,
			bind(target: ExactRenderProgramBindingTarget) {
				if (!beginCompiledProgramClaims(target, 'p', 'html', 2, 1)) return;
				claimCompiledProgramText(target, 0, 0, true);
			}
		};

		const claimed = claimCompiledRenderProgram(program, root, 'ssr');

		expect((claimed?.slotNodes[0] as Text).data).toBe('');
		expect(root.childNodes[0]).toBe(claimed?.slotNodes[0]);
		expect(root.childNodes[1]).toBe(root.firstElementChild);
	});

	it('rejects marker-free text when required preceding siblings are missing', () => {
		const root = document.createElement('p');
		const program: ExactRenderProgram = {
			...scalarProgram,
			bind(target: ExactRenderProgramBindingTarget) {
				if (!beginCompiledProgramClaims(target, 'p', 'html', 2, 1)) return;
				claimCompiledProgramText(target, 0, 1, true);
			}
		};

		expect(claimCompiledRenderProgram(program, root, 'ssr')).toBeUndefined();
		expect(root.childNodes).toHaveLength(0);
	});

	it('promotes unusually high component-slot indexes without truncating identity', () => {
		const root = document.createElement('main');
		root.innerHTML = '<!--exact:dynamic:detail--><!--/exact:dynamic:detail-->';
		const program: ExactRenderProgram = {
			version: 4,
			id: 'direct-high-component-slot',
			namespace: 'html',
			template: '<main><!--exact:dynamic:detail--><!--/exact:dynamic:detail--></main>',
			directClaims: true,
			bind(target) {
				if (!beginCompiledProgramClaims(target, 'main', 'html', 1, 33)) return;
				claimCompiledProgramChild(target, 32, 0, 'detail', true);
			}
		};

		const claimed = claimCompiledRenderProgram(program, root, 'ssr');

		expect(claimed?.componentSlots).toBeInstanceOf(Set);
		expect((claimed?.componentSlots as ReadonlySet<number>).has(32)).toBe(true);
	});

	it('preserves component ownership for a marker-free final child range', () => {
		const root = document.createElement('main');
		root.innerHTML = '<article>detail</article>';
		const program: ExactRenderProgram = {
			version: 4,
			id: 'direct-marker-free-component-tail',
			namespace: 'html',
			template: '<main></main>',
			directClaims: true,
			bind(target) {
				if (!beginCompiledProgramClaims(target, 'main', 'html', 1, 1)) return;
				claimCompiledProgramKeyedChild(target, 0, 0, true);
			}
		};

		const claimed = claimCompiledRenderProgram(program, root, 'ssr');

		expect(claimed?.slotNodes[0]).toEqual([root, root.firstChild]);
		expect(claimed?.componentSlots).toBe(1);
	});
});
