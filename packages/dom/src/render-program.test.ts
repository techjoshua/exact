/** @vitest-environment jsdom */
import { createCompiledVNode } from '@exactjs/core/runtime/render';
import { createCompiledRenderProgram as createCoreRenderProgram } from '@exactjs/core/runtime/render';
import { flushSync, reactive } from '@exactjs/reactive';
import { expect, it, vi } from 'vitest';
import { adoptStatic, render, unmount } from './index.js';
import { withGenericRenderProgramBindings } from './testing.js';

const createCompiledRenderProgram: typeof createCoreRenderProgram = (
	cacheKey,
	createProgram,
	readers,
	fallback
) =>
	createCoreRenderProgram(
		cacheKey,
		() => withGenericRenderProgramBindings(createProgram()),
		readers,
		fallback
	);

it('clones one compiler template and updates scalar slots without a generic vnode subtree', () => {
	const state = reactive({ label: 'first' });
	const vnode = createCompiledRenderProgram(
		'render-program:test',
		() => ({
			version: 3,
			id: 'render-program:test',
			namespace: 'html',
			template: '<span data-exact-id="planned">\ue000exact:0\ue001</span>',
			parts: ['<span data-exact-id="planned">', '</span>'],
			slots: [['text', 'label', [0]]],
			bindings: [['text', 0]],
			nodes: [['planned', 'span']]
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

it('mounts and patches a static compiler program without reactive bindings', () => {
	const program = () =>
		createCompiledRenderProgram(
			'render-program:static',
			() => ({
				version: 3,
				id: 'render-program:static',
				namespace: 'html',
				template: '<p data-exact-id="static" class="message">Ready</p>',
				parts: ['<p data-exact-id="static" class="message">Ready</p>'],
				slots: [],
				bindings: [],
				nodes: [['static', 'p']]
			}),
			[]
		);
	const container = document.createElement('div');
	render(program(), container);
	const paragraph = container.firstElementChild;
	render(program(), container);
	expect(container.firstElementChild).toBe(paragraph);
	expect(paragraph?.className).toBe('message');
	expect(paragraph?.textContent).toBe('Ready');
	unmount(container);
	expect(container.childNodes).toHaveLength(0);
});

it('materializes repeated program templates without sharing live DOM', () => {
	const program = () =>
		createCompiledRenderProgram(
			'render-program:repeated-template',
			() => ({
				version: 3,
				id: 'render-program:repeated-template',
				namespace: 'html',
				template: '<p data-exact-id="repeated">Repeated</p>',
				parts: [],
				slots: [],
				bindings: [],
				nodes: [['repeated', 'p']]
			}),
			[]
		);
	const first = document.createElement('div');
	const second = document.createElement('div');
	const third = document.createElement('div');
	render(program(), first);
	render(program(), second);
	render(program(), third);
	expect(first.textContent).toBe('Repeated');
	expect(second.textContent).toBe('Repeated');
	expect(third.textContent).toBe('Repeated');
	expect(first.firstElementChild).not.toBe(second.firstElementChild);
	expect(second.firstElementChild).not.toBe(third.firstElementChild);
});

it('uses ordinary host semantics for planned properties, styles, events, and refs', () => {
	const state = reactive({ disabled: false, tone: 'red', clicks: 0 });
	const refValues: unknown[] = [];
	const ref = { fulfill: (value: unknown) => refValues.push(value) };
	const vnode = createCompiledRenderProgram(
		'render-program:props',
		() => ({
			version: 3,
			id: 'render-program:props',
			namespace: 'html',
			template: '<button data-exact-id="planned-button">Save</button>',
			parts: ['<button data-exact-id="planned-button"', '', '', '', '>Save</button>'],
			slots: [
				['property', 0, 'disabled'],
				['style', 0, 'style'],
				['property', 0, 'onClick'],
				['property', 0, 'ref']
			],
			bindings: [['properties', [0, 1, 2, 3]]],
			nodes: [['planned-button', 'button']]
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
			version: 3,
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
				['property', 0, 'value'],
				['property', 1, 'value'],
				['property', 2, 'value']
			],
			bindings: [
				['properties', [1]],
				['properties', [2]],
				['properties', [0]]
			],
			nodes: [
				['page', 'select'],
				['letter', 'option'],
				['a4', 'option']
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
			version: 3,
			id: 'render-program:svg',
			namespace: 'svg',
			template: '<svg data-exact-id="svg"><circle data-exact-id="circle"></circle></svg>',
			parts: ['<svg data-exact-id="svg"><circle data-exact-id="circle"', '></circle></svg>'],
			slots: [['property', 1, 'ref']],
			bindings: [['properties', [0]]],
			nodes: [
				['svg', 'svg'],
				['circle', 'circle']
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
			version: 3,
			id: 'render-program:svg-path',
			namespace: 'svg',
			template: '<path data-exact-id="route"></path>',
			parts: ['<path data-exact-id="route"', '></path>'],
			slots: [['property', 0, 'd']],
			bindings: [['properties', [0]]],
			nodes: [['route', 'path']]
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
				version: 3,
				id: 'render-program:patched-event',
				namespace: 'html',
				template: '<button data-exact-id="patched">Run</button>',
				parts: ['<button data-exact-id="patched"', '>Run</button>'],
				slots: [['property', 0, 'onClick']],
				bindings: [['properties', [0]]],
				nodes: [['patched', 'button']]
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
			version: 3,
			id: 'render-program:single-read',
			namespace: 'html',
			template: '<span data-exact-id="single-read">\ue000exact:0\ue001</span>',
			parts: ['<span data-exact-id="single-read">', '</span>'],
			slots: [['text', 'value', [0]]],
			bindings: [['text', 0]],
			nodes: [['single-read', 'span']]
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

it('refreshes only the compiled slot group whose dependency changed', () => {
	const state = reactive({ first: 'a', second: 'b' });
	const reads = { first: 0, second: 0 };
	const vnode = createCompiledRenderProgram(
		'render-program:independent-slots',
		() => ({
			version: 3,
			id: 'render-program:independent-slots',
			namespace: 'html',
			template:
				'<section data-exact-id="slots"><span data-exact-id="first">\ue000exact:0\ue001</span><span data-exact-id="second">\ue000exact:1\ue001</span></section>',
			parts: [],
			slots: [
				['text', 'first', [0, 0]],
				['text', 'second', [1, 0]]
			],
			bindings: [
				['text', 0],
				['text', 1]
			],
			nodes: [
				['slots', 'section'],
				['first', 'span'],
				['second', 'span']
			]
		}),
		[
			() => {
				reads.first++;
				return state.first;
			},
			() => {
				reads.second++;
				return state.second;
			}
		]
	);
	const container = document.createElement('div');
	render(vnode, container);
	expect(reads).toEqual({ first: 1, second: 1 });
	state.first = 'changed';
	flushSync();
	expect(reads).toEqual({ first: 2, second: 1 });
	expect(container.textContent).toBe('changedb');
});

it('preserves static text between compiler-separated scalar slots', () => {
	const state = reactive({ owner: 'Assigned', status: 'open' });
	const vnode = createCompiledRenderProgram(
		'render-program:adjacent-scalars',
		() => ({
			version: 3,
			id: 'render-program:adjacent-scalars',
			namespace: 'html',
			template:
				'<small data-exact-id="adjacent"><!---->\ue000exact:0\ue001<!----> · <!---->\ue000exact:1\ue001<!----></small>',
			parts: ['<small data-exact-id="adjacent">', ' · ', '</small>'],
			slots: [
				['text', 'owner', [1]],
				['text', 'status', [5]]
			],
			bindings: [
				['text', 0],
				['text', 1]
			],
			nodes: [['adjacent', 'small']]
		}),
		[() => state.owner, () => state.status]
	);
	const container = document.createElement('div');
	render(vnode, container);
	expect(container.textContent).toBe('Assigned · open');
	state.status = 'closed';
	flushSync();
	expect(container.textContent).toBe('Assigned · closed');
});

it('retracks replacement readers when a compiled program invocation is patched', () => {
	const state = reactive({ first: 'a', second: 'b' });
	const program = (reader: () => string) =>
		createCompiledRenderProgram(
			'render-program:replacement-dependency',
			() => ({
				version: 3,
				id: 'render-program:replacement-dependency',
				namespace: 'html',
				template: '<span data-exact-id="replacement">\ue000exact:0\ue001</span>',
				parts: [],
				slots: [['text', 'replacement', [0]]],
				bindings: [['text', 0]],
				nodes: [['replacement', 'span']]
			}),
			[reader]
		);
	const container = document.createElement('div');
	render(
		program(() => state.first),
		container
	);
	render(
		program(() => state.second),
		container
	);
	state.first = 'ignored';
	flushSync();
	expect(container.textContent).toBe('b');
	state.second = 'tracked';
	flushSync();
	expect(container.textContent).toBe('tracked');
});

it('falls back locally when an initial text slot violates its scalar contract', () => {
	const vnode = createCompiledRenderProgram(
		'render-program:shape-fallback',
		() => ({
			version: 3,
			id: 'render-program:shape-fallback',
			namespace: 'html',
			template: '<span data-exact-id="planned">\ue000exact:0\ue001</span>',
			parts: ['<span data-exact-id="planned">', '</span>'],
			slots: [['text', 'value', [0]]],
			bindings: [['text', 0]],
			nodes: [['planned', 'span']]
		}),
		[() => createCompiledVNode('strong', {}, 'generic')],
		() => createCompiledVNode('span', { 'data-exact-id': 'fallback' }, 'fallback')
	);
	const container = document.createElement('div');
	render(vnode, container);
	expect(container.querySelector('[data-exact-id="fallback"]')?.textContent).toBe('fallback');
});

it('claims marked SSR nodes from the compiler hydration tape without indexing the subtree', () => {
	const state = reactive({ label: '', disabled: false });
	const vnode = createCompiledRenderProgram(
		'render-program:hydration-tape',
		() => ({
			version: 3,
			id: 'render-program:hydration-tape',
			namespace: 'html',
			template:
				'<section data-exact-id="root"><button data-exact-id="button">\ue000exact:0\ue001</button></section>',
			parts: [
				'<section data-exact-id="root"><button data-exact-id="button"',
				'>',
				'</button></section>'
			],
			slots: [
				['property', 1, 'disabled'],
				['text', 'label', [0, 0]]
			],
			bindings: [
				['text', 1],
				['properties', [0]]
			],
			nodes: [
				['root', 'section'],
				['button', 'button']
			]
		}),
		[() => state.disabled, () => state.label],
		() => createCompiledVNode('section', {}, createCompiledVNode('button', {}, state.label))
	);
	const container = document.createElement('div');
	container.innerHTML =
		'<!--exact:cell:root--><section data-exact-id="root"><!--exact:cell:button--><button data-exact-id="button"><!--exact:dynamic:label--><!--/exact:dynamic:label--></button><!--/exact:cell:button--></section><!--/exact:cell:root-->';
	const button = container.querySelector('button')!;
	const querySelectorAll = vi.spyOn(button.parentElement!, 'querySelectorAll');
	const createTreeWalker = vi.spyOn(document, 'createTreeWalker');

	expect(adoptStatic(vnode, container)).toBe(true);
	expect(querySelectorAll).not.toHaveBeenCalled();
	expect(createTreeWalker).not.toHaveBeenCalled();
	state.label = 'client';
	state.disabled = true;
	flushSync();
	expect(container.querySelector('button')).toBe(button);
	expect(button.textContent).toBe('client');
	expect(button.disabled).toBe(true);
	expect(container.innerHTML).toContain('exact:cell:root');
	expect(container.innerHTML).not.toContain('exact:cell:button');
});

it('mounts and updates compiler-owned structural child slots without replacing their host', () => {
	const state = reactive({ shown: true, label: 'first' });
	const vnode = createCompiledRenderProgram(
		'render-program:child-slot',
		() => ({
			version: 3,
			id: 'render-program:child-slot',
			namespace: 'html',
			template:
				'<section data-exact-id="child-root"><!--exact:dynamic:child--><!--/exact:dynamic:child--><footer data-exact-id="after">After</footer></section>',
			parts: [],
			slots: [['child', 'child']],
			bindings: [['child', 0]],
			nodes: [
				['child-root', 'section'],
				['after', 'footer']
			]
		}),
		[() => (state.shown ? createCompiledVNode('strong', {}, state.label) : null)]
	);
	const container = document.createElement('div');
	render(vnode, container);
	const host = container.firstElementChild;
	expect(container.textContent).toBe('firstAfter');
	state.label = 'second';
	flushSync();
	expect(container.textContent).toBe('secondAfter');
	state.shown = false;
	flushSync();
	expect(container.textContent).toBe('After');
	expect(container.firstElementChild).toBe(host);
});

it('claims a variable-width structural child range before later planned elements', () => {
	const state = reactive({ label: 'server' });
	const vnode = createCompiledRenderProgram(
		'render-program:adopt-child-slot',
		() => ({
			version: 3,
			id: 'render-program:adopt-child-slot',
			namespace: 'html',
			template:
				'<section><!--exact:dynamic:child--><!--/exact:dynamic:child--><footer>After</footer></section>',
			parts: [],
			slots: [['child', 'child']],
			bindings: [['child', 0]],
			nodes: [
				[0, 'section'],
				[1, 'footer']
			]
		}),
		[() => createCompiledVNode('strong', { 'data-exact-id': 'nested' }, state.label)]
	);
	const container = document.createElement('div');
	container.innerHTML =
		'<!--exact:cell:root--><section data-exact-id="child-root"><!--exact:dynamic:child--><!--exact:cell:nested--><strong data-exact-id="nested">server</strong><!--/exact:cell:nested--><!--/exact:dynamic:child--><footer data-exact-id="after">After</footer></section><!--/exact:cell:root-->';
	const host = container.querySelector('section');
	const nested = container.querySelector('strong');
	expect(adoptStatic(vnode, container)).toBe(true);
	state.label = 'client';
	flushSync();
	expect(container.querySelector('section')).toBe(host);
	expect(container.querySelector('strong')).toBe(nested);
	expect(nested?.textContent).toBe('client');
	// The compatibility program keeps its own recovery envelope, while the adopted single-element
	// child transfers ownership away from its now-redundant nested cell markers.
	expect(container.innerHTML).toContain('exact:cell:root');
	expect(container.innerHTML).not.toContain('exact:cell:nested');
});

it('rejects a marked SSR program when its hydration tape does not match the DOM', () => {
	const vnode = createCompiledRenderProgram(
		'render-program:invalid-hydration-tape',
		() => ({
			version: 3,
			id: 'render-program:invalid-hydration-tape',
			namespace: 'html',
			template:
				'<section data-exact-id="root"><button data-exact-id="button">Save</button></section>',
			parts: [
				'<section data-exact-id="root"><button data-exact-id="button">Save</button></section>'
			],
			slots: [],
			bindings: [],
			nodes: [
				['root', 'section'],
				['missing-button', 'button']
			]
		}),
		[],
		() => createCompiledVNode('section', {}, createCompiledVNode('button', {}, 'Save'))
	);
	const container = document.createElement('div');
	container.innerHTML =
		'<!--exact:cell:root--><section data-exact-id="root"><!--exact:cell:button--><button data-exact-id="button">Save</button><!--/exact:cell:button--></section><!--/exact:cell:root-->';

	expect(adoptStatic(vnode, container)).toBe(false);
});
