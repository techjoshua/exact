/** @vitest-environment jsdom */
import { createCompiledRenderProgram, createCompiledVNode } from '@exactjs/core';
import { flushSync, reactive } from '@exactjs/reactive';
import { expect, it } from 'vitest';
import { render, unmount } from './index.js';

it('clones one compiler template and updates scalar slots without a generic vnode subtree', () => {
	const state = reactive({ label: 'first' });
	const vnode = createCompiledRenderProgram(
		'render-program:test',
		() => ({
			version: 1,
			id: 'render-program:test',
			namespace: 'html',
			template: '<span data-exact-id="planned">\ue000exact:0\ue001</span>',
			parts: ['<span data-exact-id="planned">', '</span>'],
			slots: [{ id: 'label', kind: 'text', path: [0] }],
			nodes: [{ id: 'planned', path: [], tag: 'span', namespace: 'html' }]
		}),
		[() => state.label],
		() => createCompiledVNode('span', { 'data-exact-id': 'planned' }, state.label)
	);
	const container = document.createElement('div');
	render(vnode, container);
	expect(container.textContent).toBe('first');
	state.label = 'second';
	flushSync();
	expect(container.textContent).toBe('second');
});

it('uses ordinary host semantics for planned properties, styles, events, and refs', () => {
	const state = reactive({ disabled: false, tone: 'red', clicks: 0 });
	const refValues: unknown[] = [];
	const ref = { fulfill: (value: unknown) => refValues.push(value) };
	const vnode = createCompiledRenderProgram(
		'render-program:props',
		() => ({
			version: 1,
			id: 'render-program:props',
			namespace: 'html',
			template: '<button data-exact-id="planned-button">Save</button>',
			parts: ['<button data-exact-id="planned-button"', '', '', '', '>Save</button>'],
			slots: [
				{ id: 'disabled', kind: 'property', path: [], name: 'disabled' },
				{ id: 'style', kind: 'style', path: [], name: 'style' },
				{ id: 'click', kind: 'property', path: [], name: 'onClick' },
				{ id: 'ref', kind: 'property', path: [], name: 'ref' }
			],
			nodes: [{ id: 'planned-button', path: [], tag: 'button', namespace: 'html' }]
		}),
		[() => state.disabled, () => ({ color: state.tone }), () => () => state.clicks++, () => ref],
		() => createCompiledVNode('button', {}, 'Save')
	);
	const container = document.createElement('div');
	render(vnode, container);
	const button = container.querySelector('button')!;
	expect(refValues).toEqual([button]);
	expect(button.style.color).toBe('red');
	button.click();
	expect(state.clicks).toBe(1);
	state.disabled = true;
	state.tone = 'blue';
	flushSync();
	expect(button.disabled).toBe(true);
	expect(button.style.color).toBe('blue');
	unmount(container);
	expect(refValues.at(-1)).toBeUndefined();
});

it('applies a controlled select value after slotted option values', () => {
	const state = reactive({ value: 'letter' });
	const vnode = createCompiledRenderProgram(
		'render-program:select-value-order',
		() => ({
			version: 1,
			id: 'render-program:select-value-order',
			namespace: 'html',
			template:
				'<select data-exact-id="page"><option data-exact-id="letter">Letter</option><option data-exact-id="a4">A4</option></select>',
			parts: [
				'<select data-exact-id="page"',
				'><option data-exact-id="letter"',
				'>Letter</option><option data-exact-id="a4"',
				'>A4</option></select>'
			],
			slots: [
				{ id: 'selected', kind: 'property', path: [], name: 'value' },
				{ id: 'letter-value', kind: 'property', path: [0], name: 'value' },
				{ id: 'a4-value', kind: 'property', path: [1], name: 'value' }
			],
			nodes: [
				{ id: 'page', path: [], tag: 'select', namespace: 'html' },
				{ id: 'letter', path: [0], tag: 'option', namespace: 'html' },
				{ id: 'a4', path: [1], tag: 'option', namespace: 'html' }
			]
		}),
		[() => state.value, () => 'letter', () => 'a4'],
		() =>
			createCompiledVNode(
				'select',
				{ value: state.value },
				createCompiledVNode('option', { value: 'letter' }, 'Letter'),
				createCompiledVNode('option', { value: 'a4' }, 'A4')
			)
	);
	const container = document.createElement('div');
	render(vnode, container);
	expect(container.querySelector('select')?.value).toBe('letter');
});

it('releases non-reactive planned refs and preserves SVG namespaces', () => {
	const values: unknown[] = [];
	const ref = { fulfill: (value: unknown) => values.push(value) };
	const vnode = createCompiledRenderProgram(
		'render-program:svg',
		() => ({
			version: 1,
			id: 'render-program:svg',
			namespace: 'svg',
			template: '<svg data-exact-id="svg"><circle data-exact-id="circle"></circle></svg>',
			parts: ['<svg data-exact-id="svg"><circle data-exact-id="circle"', '></circle></svg>'],
			slots: [{ id: 'ref', kind: 'property', path: [0], name: 'ref' }],
			nodes: [
				{ id: 'svg', path: [], tag: 'svg', namespace: 'svg' },
				{ id: 'circle', path: [0], tag: 'circle', namespace: 'svg' }
			]
		}),
		[() => ref],
		() => createCompiledVNode('svg', {}, createCompiledVNode('circle', {}))
	);
	const container = document.createElement('div');
	render(vnode, container);
	expect((values[0] as Element).namespaceURI).toBe('http://www.w3.org/2000/svg');
	unmount(container);
	expect(values.at(-1)).toBeUndefined();
});

it('mounts a standalone planned SVG child in its compiler-owned namespace', () => {
	const vnode = createCompiledRenderProgram(
		'render-program:svg-path',
		() => ({
			version: 1,
			id: 'render-program:svg-path',
			namespace: 'svg',
			template: '<path data-exact-id="route"></path>',
			parts: ['<path data-exact-id="route"', '></path>'],
			slots: [{ id: 'path', kind: 'property', path: [], name: 'd' }],
			nodes: [{ id: 'route', path: [], tag: 'path', namespace: 'svg' }]
		}),
		[() => 'M 0 0 L 10 10'],
		() => createCompiledVNode('path', { 'data-exact-id': 'route' })
	);
	const container = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	render(vnode, container);
	const path = container.firstElementChild!;
	expect(path.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(path.getAttribute('d')).toBe('M 0 0 L 10 10');
});

it('reinstalls static event readers when a program invocation is patched', () => {
	const calls: string[] = [];
	const program = (label: string) =>
		createCompiledRenderProgram(
			'render-program:patched-event',
			() => ({
				version: 1,
				id: 'render-program:patched-event',
				namespace: 'html',
				template: '<button data-exact-id="patched">Run</button>',
				parts: ['<button data-exact-id="patched"', '>Run</button>'],
				slots: [{ id: 'click', kind: 'property', path: [], name: 'onClick' }],
				nodes: [{ id: 'patched', path: [], tag: 'button', namespace: 'html' }]
			}),
			[() => () => calls.push(label)],
			() => createCompiledVNode('button', {}, 'Run')
		);
	const container = document.createElement('div');
	render(program('first'), container);
	(container.firstElementChild as HTMLElement).click();
	render(program('second'), container);
	(container.firstElementChild as HTMLElement).click();
	expect(calls).toEqual(['first', 'second']);
});

it('evaluates an initial planned slot exactly once', () => {
	let reads = 0;
	const vnode = createCompiledRenderProgram(
		'render-program:single-read',
		() => ({
			version: 1,
			id: 'render-program:single-read',
			namespace: 'html',
			template: '<span data-exact-id="single-read">\ue000exact:0\ue001</span>',
			parts: ['<span data-exact-id="single-read">', '</span>'],
			slots: [{ id: 'value', kind: 'text', path: [0] }],
			nodes: [{ id: 'single-read', path: [], tag: 'span', namespace: 'html' }]
		}),
		[
			() => {
				reads++;
				return 'once';
			}
		],
		() => createCompiledVNode('span', {}, 'once')
	);
	const container = document.createElement('div');
	render(vnode, container);
	expect(container.textContent).toBe('once');
	expect(reads).toBe(1);
});

it('falls back locally when an initial text slot violates its scalar contract', () => {
	const vnode = createCompiledRenderProgram(
		'render-program:shape-fallback',
		() => ({
			version: 1,
			id: 'render-program:shape-fallback',
			namespace: 'html',
			template: '<span data-exact-id="planned">\ue000exact:0\ue001</span>',
			parts: ['<span data-exact-id="planned">', '</span>'],
			slots: [{ id: 'value', kind: 'text', path: [0] }],
			nodes: [{ id: 'planned', path: [], tag: 'span', namespace: 'html' }]
		}),
		[() => createCompiledVNode('strong', {}, 'generic')],
		() => createCompiledVNode('span', { 'data-exact-id': 'fallback' }, 'fallback')
	);
	const container = document.createElement('div');
	render(vnode, container);
	expect(container.querySelector('[data-exact-id="fallback"]')?.textContent).toBe('fallback');
});
