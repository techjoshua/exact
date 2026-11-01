/** @vitest-environment jsdom */
import './unsafe-html.js';
import { expect, it } from 'vitest';
import { unsafeHtml } from '@exactjs/core';
import { componentRootLifecycle } from '../../core/src/component/root-lifecycle.js';
import { defaultErrorContext } from '../../core/src/component/errors.js';
import { renderTestTree, inspectDomRoot, type DomInspectionNode } from './testing.js';
import { unmount } from './root.js';
import { mountedDomNodes } from './placement.js';
import { createEffectScope } from '@exactjs/reactive/framework/runtime';
import { verifyDomRangeObservations } from '../../component-composition-corpus/test-support/dom-range-observation-journey.mjs';
it.each([3, 1_000])(
	'preserves raw range output and ordinary observations for %i nodes',
	(count) => {
		verifyDomRangeObservations(
			{
				renderTestTree,
				inspectDomRoot,
				unmount,
				unsafeHtml,
				componentRootLifecycle,
				defaultErrorContext
			},
			document,
			count
		);
	}
);

it('keeps a cached range observation independent of its accepted membership', () => {
	const container = document.createElement('main');
	try {
		renderTestTree(unsafeHtml('<b>first</b><i>last</i>'), container, { allowUnsafeHtml: true });
		const owner = inspectDomRoot(container)!.instance!;
		const lifecycle = componentRootLifecycle<{ kind: string; nodes: Node[] }>(owner);
		const view = lifecycle.current!;
		const original = view.nodes;
		expect(Object.isFrozen(original)).toBe(false);
		expect(() => original.splice(0, 1, document.createComment('local'))).not.toThrow();
		expect(view.nodes).toEqual(Array.from(container.querySelectorAll('b, i')));
		expect(view.nodes).not.toBe(view.nodes);
		expect(view.nodes[0]).toBe(container.querySelector('b'));
		// Only nodes is a computed observation. Ordinary data fields stay writable.
		view.kind = 'local observation';
		expect(view.kind).toBe('local observation');
		view.kind = 'range';
		expect(Object.getOwnPropertyDescriptor(view, 'nodes')).toMatchObject({
			get: expect.any(Function),
			configurable: true,
			enumerable: true
		});
		renderTestTree(unsafeHtml('<u>next</u><em>end</em>'), container);
		expect(lifecycle.current).toBe(view);
		expect(view.nodes).toEqual(Array.from(container.querySelectorAll('u, em')));
		expect(view.nodes[0]).toBe(container.querySelector('u'));
	} finally {
		unmount(container);
	}
	expect(container.childNodes.length).toBe(0);
	expect(inspectDomRoot(container)).toBeUndefined();
});

it('collects a wide raw range in order without a variadic call', ({ onTestFinished }) => {
	const scope = createEffectScope();
	onTestFinished(() => scope.stop());
	const dom = document.createComment('start');
	const end = document.createComment('end');
	const rawNodes = Array.from({ length: 140_000 }, () => document.createComment('node'));
	const nodes = mountedDomNodes({ dom, end, rawNodes, scope, children: [] });
	expect(nodes.length).toBe(rawNodes.length + 2);
	expect(nodes[0]).toBe(dom);
	expect(nodes[1]).toBe(rawNodes[0]);
	expect(nodes.at(-2)).toBe(rawNodes.at(-1));
	expect(nodes.at(-1)).toBe(end);
});
function checkReadonlyTypes(node: DomInspectionNode) {
	// @ts-expect-error Inspection metadata retains compile-time readonly diagnostics.
	node.operation.type = 'changed';
	// @ts-expect-error Inspection child lists remain readonly in TypeScript.
	node.children.length = 0;
	// @ts-expect-error Element observations remain readonly in TypeScript.
	node.elements().push(document.createElement('mark'));
}
void checkReadonlyTypes;
