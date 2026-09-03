/** @vitest-environment jsdom */
import { encodeExactMarkerPart } from '@exactjs/core';
import { exactComponentIdentity } from '@exactjs/core/framework/component-contracts';
import {
	createServerBoundary,
	prepareCompiledRenderProgram as prepareCoreRenderProgram
} from '@exactjs/core/runtime/render';
import { flushSync, reactive } from '@exactjs/reactive';
import { expect, it, vi } from 'vitest';
import { adoptStatic } from './test-support/adoption.js';
import { unmount } from './index.js';
import { legacyTestRenderProgram, renderTestTree as render } from './testing.js';
import {
	createCompiledOperation,
	createTestComponentReceipt,
	createOperation
} from './test-support/native-operations.js';
import {
	createTestCompiledRenderProgram as createCompiledRenderProgram,
	createTestPreparedRenderProgram
} from './test-support/render-program.js';
import {
	beginCompiledProgramClaims,
	bindCompiledReactiveProgramProperties,
	bindCompiledProgramText,
	claimCompiledProgramElementPath,
	claimCompiledProgramProperty,
	claimCompiledProgramText,
	enterCompiledProgramElement,
	leaveCompiledProgramElement
} from './runtime/render-program.js';

it('fails closed with the unsupported compiler boundary identity', () => {
	const container = document.createElement('div');
	render(createServerBoundary('router', 'Router'), container);
	expect(container.textContent).toContain(
		'A server boundary cannot be mounted by the DOM target (Router)'
	);
});

it('clones one compiler template and updates scalar slots without a generic vnode subtree', () => {
	const state = reactive({ label: 'first' });
	const vnode = createCompiledRenderProgram(
		'render-program:test',
		() => ({
			version: 8,
			id: 'render-program:test',
			namespace: 'html',
			template: '<span data-exact-id="planned">\ue000exact:0\ue001</span>',
			slots: [['text', 'label', [0]]],
			bindings: [['text', 0]],
			nodes: [[0, 'span']]
		}),
		[() => state.label],
		() => createCompiledOperation('span', { 'data-exact-id': 'planned' }, state.label)
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
				version: 8,
				id: 'render-program:static',
				namespace: 'html',
				template: '<p data-exact-id="static" class="message">Ready</p>',
				slots: [],
				bindings: [],
				nodes: [[0, 'p']]
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
				version: 8,
				id: 'render-program:repeated-template',
				namespace: 'html',
				template: '<p data-exact-id="repeated">Repeated</p>',
				slots: [],
				bindings: [],
				nodes: [[0, 'p']]
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
			version: 8,
			id: 'render-program:props',
			namespace: 'html',
			template: '<button data-exact-id="planned-button">Save</button>',
			slots: [
				['property', 0, 'disabled'],
				['style', 0, 'style'],
				['property', 0, 'onClick'],
				['property', 0, 'ref']
			],
			bindings: [['properties', [0, 1, 2, 3]]],
			nodes: [[0, 'button']]
		}),
		[() => state.disabled, () => ({ color: state.tone }), () => () => state.clicks++, () => ref],
		() => createCompiledOperation('button', {}, 'Save')
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
			version: 8,
			id: 'render-program:select-value-order',
			namespace: 'html',
			template:
				'<select data-exact-id="page"><option data-exact-id="letter">Letter</option><option data-exact-id="a4">A4</option></select>',
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
				[0, 'select'],
				[1, 'option'],
				[2, 'option']
			]
		}),
		[() => state.value, () => 'letter', () => 'a4'],
		() =>
			createCompiledOperation(
				'select',
				{ value: state.value },
				createCompiledOperation('option', { value: 'letter' }, 'Letter'),
				createCompiledOperation('option', { value: 'a4' }, 'A4')
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
			version: 8,
			id: 'render-program:svg',
			namespace: 'svg',
			template: '<svg data-exact-id="svg"><circle data-exact-id="circle"></circle></svg>',
			slots: [['property', 1, 'ref']],
			bindings: [['properties', [0]]],
			nodes: [
				[0, 'svg'],
				[1, 'circle']
			]
		}),
		[() => ref],
		() => createCompiledOperation('svg', {}, createCompiledOperation('circle', {}))
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
			version: 8,
			id: 'render-program:svg-path',
			namespace: 'svg',
			template: '<path data-exact-id="route"></path>',
			slots: [['property', 0, 'd']],
			bindings: [['properties', [0]]],
			nodes: [[0, 'path']]
		}),
		[() => 'M 0 0 L 10 10'],
		() => createCompiledOperation('path', { 'data-exact-id': 'route' })
	);
	const container = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	render(vnode, container);
	const path = container.firstElementChild!;
	expect(path.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(path.getAttribute('d')).toBe('M 0 0 L 10 10');
});

it('resolves a component-local contextual program from each physical attachment', () => {
	const descriptor = prepareCoreRenderProgram({
		version: 8,
		id: 'render-program:contextual-path',
		namespace: 'contextual',
		attachmentTag: 'path',
		template: '<path data-exact-id="contextual"></path>',
		directClaims: true,
		root: ['path', 'contextual'],
		work: [1, 0]
	});
	const program = () => createTestPreparedRenderProgram(descriptor, []);
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	const html = document.createElement('div');

	render(program(), svg);
	render(program(), html);

	expect(svg.firstElementChild?.namespaceURI).toBe('http://www.w3.org/2000/svg');
	expect(html.firstElementChild?.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
});

it('resolves contextual HTML at an SVG integration point', () => {
	const descriptor = prepareCoreRenderProgram({
		version: 8,
		id: 'render-program:contextual-foreign-object-child',
		namespace: 'contextual',
		attachmentTag: 'div',
		template: '<div data-exact-id="contextual-html"></div>',
		directClaims: true,
		root: ['div', 'contextual'],
		work: [1, 0]
	});
	const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');

	render(createTestPreparedRenderProgram(descriptor, []), foreignObject);

	expect(foreignObject.firstElementChild?.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
});

it('reinstalls static event readers when a program invocation is patched', () => {
	const calls: string[] = [];
	const program = (label: string) =>
		createCompiledRenderProgram(
			'render-program:patched-event',
			() => ({
				version: 8,
				id: 'render-program:patched-event',
				namespace: 'html',
				template: '<button data-exact-id="patched">Run</button>',
				slots: [['property', 0, 'onClick']],
				bindings: [['properties', [0]]],
				nodes: [[0, 'button']]
			}),
			[() => () => calls.push(label)],
			() => createCompiledOperation('button', {}, 'Run')
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
			version: 8,
			id: 'render-program:single-read',
			namespace: 'html',
			template: '<span data-exact-id="single-read">\ue000exact:0\ue001</span>',
			slots: [['text', 'value', [0]]],
			bindings: [['text', 0]],
			nodes: [[0, 'span']]
		}),
		[
			() => {
				reads++;
				return 'once';
			}
		],
		() => createCompiledOperation('span', {}, 'once')
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
			version: 8,
			id: 'render-program:independent-slots',
			namespace: 'html',
			template:
				'<section data-exact-id="slots"><span data-exact-id="first">\ue000exact:0\ue001</span><span data-exact-id="second">\ue000exact:1\ue001</span></section>',
			slots: [
				['text', 'first', [0, 0]],
				['text', 'second', [1, 0]]
			],
			bindings: [
				['text', 0],
				['text', 1]
			],
			nodes: [
				[0, 'section'],
				[1, 'span'],
				[2, 'span']
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
			version: 8,
			id: 'render-program:adjacent-scalars',
			namespace: 'html',
			template:
				'<small data-exact-id="adjacent"><!---->\ue000exact:0\ue001<!----> · <!---->\ue000exact:1\ue001<!----></small>',
			slots: [
				['text', 'owner', [1]],
				['text', 'status', [5]]
			],
			bindings: [
				['text', 0],
				['text', 1]
			],
			nodes: [[0, 'small']]
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
				version: 8,
				id: 'render-program:replacement-dependency',
				namespace: 'html',
				template: '<span data-exact-id="replacement">\ue000exact:0\ue001</span>',
				slots: [['text', 'replacement', [0]]],
				bindings: [['text', 0]],
				nodes: [[0, 'span']]
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

it('fails closed when an initial text slot violates its scalar contract', () => {
	const vnode = createCompiledRenderProgram(
		'render-program:shape-fallback',
		() => ({
			version: 8,
			id: 'render-program:shape-fallback',
			namespace: 'html',
			template: '<span data-exact-id="planned">\ue000exact:0\ue001</span>',
			slots: [['text', 'value', [0]]],
			bindings: [['text', 0]],
			nodes: [[0, 'span']]
		}),
		[() => createCompiledOperation('strong', {}, 'generic')],
		() => createCompiledOperation('span', { 'data-exact-id': 'fallback' }, 'fallback')
	);
	const container = document.createElement('div');
	render(vnode, container);
	expect(container.querySelector('[data-exact-id="fallback"]')).toBeNull();
	expect(container.textContent).toContain('Compiler-closed render program could not be mounted');
});

it('claims marked SSR nodes through compiler-generated hydration calls without indexing the subtree', () => {
	const state = reactive({ label: '', disabled: false });
	const program = prepareCoreRenderProgram(
		legacyTestRenderProgram({
			version: 8,
			id: 'render-program:hydration-plan',
			namespace: 'html',
			template:
				'<section data-exact-id="root"><button data-exact-id="button">\ue000exact:0\ue001</button></section>',
			directClaims: true,
			bind(target) {
				if (beginCompiledProgramClaims(target, 'section', 'html', 2, 2)) {
					claimCompiledProgramElementPath(target, 1, 1, 'button');
					claimCompiledProgramProperty(target, 0, 1);
					enterCompiledProgramElement(target, 1);
					claimCompiledProgramText(target, 1, 0, 'label');
					leaveCompiledProgramElement(target);
					return;
				}
				bindCompiledProgramText(target, 1);
				bindCompiledReactiveProgramProperties(target, 0, 0);
			}
		})
	);
	const operation = createTestPreparedRenderProgram(
		program,
		[() => state.disabled, () => state.label],
		(_group, apply) => apply('disabled', state.disabled)
	);
	const container = document.createElement('div');
	container.innerHTML =
		'<!--exact:dynamic:test-root--><!--exact:cell:root--><section data-exact-id="root"><!--exact:cell:button--><button data-exact-id="button"><!--x:label--><!--/x:label--></button><!--/exact:cell:button--></section><!--/exact:cell:root--><!--/exact:dynamic:test-root-->';
	const button = container.querySelector('button')!;
	const querySelectorAll = vi.spyOn(button.parentElement!, 'querySelectorAll');
	const createTreeWalker = vi.spyOn(document, 'createTreeWalker');

	expect(adoptStatic(operation, container)).toBe(true);
	expect(button.disabled).toBe(false);
	expect(querySelectorAll).not.toHaveBeenCalled();
	expect(createTreeWalker).not.toHaveBeenCalled();
	state.label = 'client';
	state.disabled = true;
	flushSync();
	expect(container.querySelector('button')).toBe(button);
	expect(button.textContent).toBe('client');
	expect(button.disabled).toBe(true);
});

it('mounts and updates compiler-owned structural child slots without replacing their host', () => {
	const state = reactive({ shown: true, label: 'first' });
	const vnode = createCompiledRenderProgram(
		'render-program:child-slot',
		() => ({
			version: 8,
			id: 'render-program:child-slot',
			namespace: 'html',
			template:
				'<section data-exact-id="child-root"><!--x:child--><!--/x:child--><footer data-exact-id="after">After</footer></section>',
			slots: [['child', 'child']],
			bindings: [['child', 0]],
			nodes: [
				[0, 'section'],
				[1, 'footer']
			]
		}),
		[() => (state.shown ? createCompiledOperation('strong', {}, state.label) : null)]
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
	const readChild = vi.fn(() =>
		createCompiledOperation('strong', { 'data-exact-id': 'nested' }, state.label)
	);
	const vnode = createCompiledRenderProgram(
		'render-program:adopt-child-slot',
		() => ({
			version: 8,
			id: 'render-program:adopt-child-slot',
			namespace: 'html',
			template: '<section><!--x:child--><!--/x:child--><footer>After</footer></section>',
			slots: [['child', 'child']],
			bindings: [['child', 0]],
			nodes: [
				[0, 'section'],
				[1, 'footer']
			]
		}),
		[readChild]
	);
	const container = document.createElement('div');
	container.innerHTML =
		'<!--exact:dynamic:test-root--><!--exact:cell:root--><section data-exact-id="child-root"><!--x:child--><strong data-exact-id="nested">server</strong><!--/x:child--><footer data-exact-id="after">After</footer></section><!--/exact:cell:root--><!--/exact:dynamic:test-root-->';
	const host = container.querySelector('section');
	const nested = container.querySelector('strong');
	expect(adoptStatic(vnode, container)).toBe(true);
	// Adoption reads once to claim the range and once to establish its retained dependency watcher.
	expect(readChild).toHaveBeenCalledTimes(2);
	state.label = 'client';
	flushSync();
	expect(container.querySelector('section')).toBe(host);
	expect(container.querySelector('strong')).toBe(nested);
	expect(nested?.textContent).toBe('client');
});

it.each([
	['compiler-owned', false],
	['generic-list', true]
])('adopts a %s component boundary inside a component slot', (_lane, marked) => {
	function Child() {
		return () => createOperation('strong', {}, 'server');
	}
	const childReceipt = createTestComponentReceipt(Child, {});
	const vnode = createCompiledRenderProgram(
		'render-program:adopt-component-slot',
		() => ({
			version: 8,
			id: 'render-program:adopt-component-slot',
			namespace: 'html',
			template: '<section><!--x:child--><!--/x:child--><footer>After</footer></section>',
			slots: [['component', 'child']],
			bindings: [['component', 0]],
			nodes: [
				[0, 'section'],
				[1, 'footer']
			]
		}),
		[() => childReceipt]
	);
	const componentIdentity = encodeExactMarkerPart(exactComponentIdentity(Child));
	const componentMarker = `exact:component:0:${componentIdentity}`;
	const componentHtml = marked
		? `<!--${componentMarker}--><strong>server</strong><!--/${componentMarker}-->`
		: '<strong>server</strong>';
	const container = document.createElement('div');
	container.innerHTML = `<!--exact:dynamic:test-root--><!--exact:cell:root--><section><!--x:child-->${componentHtml}<!--/x:child--><footer>After</footer></section><!--/exact:cell:root--><!--/exact:dynamic:test-root-->`;
	const strong = container.querySelector('strong');

	expect(adoptStatic(vnode, container)).toBe(true);
	expect(container.querySelector('strong')).toBe(strong);
	expect(container.textContent).toBe('serverAfter');
});
