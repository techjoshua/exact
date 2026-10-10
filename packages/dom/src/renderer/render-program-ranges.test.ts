/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import type { ExactRenderProgram } from '@exactjs/core/runtime/render-operations';
import {
	createPreparedRenderProgram,
	prepareCompiledRenderProgram
} from '@exactjs/core/runtime/render-operations';
import { createEffectScope } from '@exactjs/reactive/framework/runtime';
import { flushSync, reactive } from '@exactjs/reactive';
import { adoptStatic } from '../test-support/adoption.js';
import { createCompiledOperation } from '../test-support/native-operations.js';
import { unmount } from '../index.js';
import type { Mounted, RenderProgramChildAnchor } from '../types.js';
import { claimCompiledRenderProgram } from './render-program-claims.js';
import { adoptProgramChildSlots } from './render-program-adoption.js';
import { createRendererRoot } from './root-construction.js';
import { bindProgramChild } from './render-program-children.js';
import { bindProgramComponent } from './render-program-components.js';
import { findProgramChildEnd } from './render-program-markers.js';

const scopes: ReturnType<typeof createEffectScope>[] = [];
const containers: Element[] = [];
afterEach(() => {
	for (const container of containers.splice(0)) unmount(container);
	for (const scope of scopes.splice(0)) scope.stop();
});

it.each(['slot', 'exact:slot', ''])(
	'matches normalized opaque marker identity %j without stripping it again',
	(identity) => {
		const element = document.createElement('main');
		element.innerHTML = `<!--x:${identity}--><span>child</span><!--/x:${identity}-->`;
		expect(findProgramChildEnd(element.firstChild!, identity)).toBe(element.lastChild);
		element.lastChild!.remove();
		expect(findProgramChildEnd(element.firstChild!, identity)).toBeUndefined();
	}
);

it('retains hydrated child identity, replaces and removes within its boundary, and stops on disposal', () => {
	const state = reactive({ tag: 'strong', label: 'server', shown: true });
	const readChild = vi.fn(() =>
		state.shown ? createCompiledOperation(state.tag, {}, state.label) : null
	);
	const program: ExactRenderProgram = {
		version: 2,
		id: 'retained-marked-range',
		namespace: 'html',
		template: '<section><!--x:child--><!--/x:child--><footer>after</footer></section>',
		directClaims: true,
		wire: [['section', 'html', 2, 1], [[5, 0, 0, 'child']], [[1, 0]]]
	};
	const operation = createPreparedRenderProgram(prepareCompiledRenderProgram(program), [readChild]);
	const container = document.createElement('div');
	containers.push(container);
	container.innerHTML =
		'<!--exact:dynamic:test-root--><!--exact:cell:root--><section><!--x:child--><strong>server</strong><!--/x:child--><footer>after</footer></section><!--/exact:cell:root--><!--/exact:dynamic:test-root-->';
	const original = container.querySelector('strong');
	const footer = container.querySelector('footer');
	expect(adoptStatic(operation, container)).toBe(true);
	expect(container.querySelector('strong')).toBe(original);
	state.label = 'updated';
	flushSync();
	expect(container.querySelector('strong')).toBe(original);
	expect(original?.textContent).toBe('updated');
	state.tag = 'em';
	flushSync();
	expect(container.querySelector('strong')).toBeNull();
	expect(container.querySelector('em')?.textContent).toBe('updated');
	state.shown = false;
	flushSync();
	expect(container.querySelector('em')).toBeNull();
	expect(container.textContent).toBe('after');
	state.shown = true;
	state.label = 'returned';
	flushSync();
	expect(container.querySelector('em')?.textContent).toBe('returned');
	expect(container.querySelector('footer')).toBe(footer);
	expect(container.textContent).toBe('returnedafter');
	unmount(container);
	const reads = readChild.mock.calls.length;
	state.label = 'disposed';
	flushSync();
	expect(readChild).toHaveBeenCalledTimes(reads);
});

function claimedRange(bounded: boolean, component = false): Mounted {
	const element = document.createElement('main');
	element.innerHTML = '<article>child</article>' + (bounded ? '<footer>after</footer>' : '');
	const program: ExactRenderProgram = {
		version: 2,
		id: 'range-retention',
		namespace: 'html',
		template: '',
		directClaims: true,
		wire: [
			['main', 'html', 2, 1],
			bounded
				? [
						[6, 1, 1 + 64 * 16, 'footer'],
						[4, 0, 0, component, 1]
					]
				: [[4, 0, 0, component]],
			[]
		]
	};
	const claimed = claimCompiledRenderProgram(program, element, 'ssr')!;
	const scope = createEffectScope();
	scopes.push(scope);
	return {
		dom: element,
		scope,
		children: [],
		renderProgram: {
			invocation: { program, readers: [() => []] },
			programRoot: element,
			slotNodes: claimed.slotNodes,
			componentSlots: claimed.componentSlots,
			root: createRendererRoot(element, null, {}, { version: 1 })
		}
	};
}

it.each([false, true])(
	'releases the initial DOM reference after adopting a bounded=%s range',
	(bounded) => {
		const mounted = claimedRange(bounded);
		const anchor = mounted.renderProgram!.slotNodes[0] as RenderProgramChildAnchor;
		const child = anchor[1];
		let first: Node | undefined;
		expect(
			adoptProgramChildSlots(mounted, undefined, (_values, nodes, _owner, _scope, cursor) => {
				first = nodes[cursor];
				return [];
			})
		).toBe(true);
		expect(first).toBe(child);
		// Durable range ownership must not retain a disposable initial child through its claim anchor.
		expect(anchor[1]).toBeNull();
		expect(mounted.renderProgram!.childSlots?.[0]?.before).toBe(
			bounded ? mounted.dom.lastChild : null
		);
	}
);

it.each([
	[
		'child',
		(mounted: Mounted, initial: boolean) => bindProgramChild(mounted, 0, initial, [], true),
		false
	],
	[
		'component',
		(mounted: Mounted, initial: boolean) => bindProgramComponent(mounted, 0, initial),
		true
	]
] as const)(
	'releases temporary DOM references during %s slot preparation',
	(_kind, apply, component) => {
		const mounted = claimedRange(true, component);
		const anchor = mounted.renderProgram!.slotNodes[0] as RenderProgramChildAnchor;
		expect(anchor[1]).not.toBeNull();
		expect(apply(mounted, true)).toBe(true);
		expect(anchor[1]).toBeNull();
		expect(mounted.renderProgram!.childSlots?.[0]?.before).toBe(mounted.dom.lastChild);
		// Rebinding uses durable ownership, not the released adoption cursor.
		expect(apply(mounted, false)).toBe(true);
	}
);

it.each(['template', 'ssr'] as const)(
	'preserves adjacent and nested marked ranges while claiming %s',
	(source) => {
		const element = document.createElement('main');
		element.innerHTML =
			'<!--x:a--><section><!--x:nested--><i>inside</i><!--/x:nested--></section><!--/x:a--><!--x:b--><!--/x:b--><footer>after</footer>';
		const program: ExactRenderProgram = {
			version: 2,
			id: 'marked-boundaries',
			namespace: 'html',
			template: '',
			directClaims: true,
			wire: [
				['main', 'html', 1, 2],
				[
					[5, 0, 0, 'a'],
					[5, 1, 0, 'b']
				],
				[]
			]
		};
		const claimed = claimCompiledRenderProgram(program, element, source)!;
		if (source === 'template') {
			expect(claimed.slotNodes[0]).toBe(element.firstChild);
			expect(claimed.slotNodes[1]).toBe(element.childNodes[3]);
		} else {
			expect(claimed.slotNodes[0]).toEqual([element, element.childNodes[1], element.childNodes[2]]);
			expect(claimed.slotNodes[1]).toEqual([element, element.childNodes[4], element.childNodes[4]]);
		}
		element.childNodes[4].remove();
		expect(claimCompiledRenderProgram(program, element, source)).toBeUndefined();
	}
);
