/** @vitest-environment jsdom */
import { createServerBoundary, markFiniteClientBoundary } from '@exactjs/core';
import { renderToHydratableString } from '@exactjs/ssr';
import { expect, it } from 'vitest';
import { hydrateClientIslands, readExactHydrationConfig } from './index.js';
import { createVNode, markTestComponents } from './test-support/native-vnode.js';

it('resolves compiler-finite island props from a grouped response table', () => {
	function Counter(props: { label: string }) {
		return () => createVNode('button', null, props.label);
	}
	const rendered = renderToHydratableString(
		markFiniteClientBoundary(
			createServerBoundary('counter-1', 'Counter', {
				label: 'Compact'
			})
		),
		{ markers: false }
	);
	expect(rendered.html).toContain('data-xh="0.0"');
	expect(rendered.html).not.toContain('data-exact-client-boundary');
	expect(rendered.html).not.toContain('data-exact-client-props');
	const container = document.createElement('main');
	container.innerHTML = rendered.htmlWithHydration;
	const config = readExactHydrationConfig(container);
	expect(config.hydrationTable).toEqual([1, [['Counter', ['label'], [['counter-1', 'Compact']]]]]);
	expect(
		hydrateClientIslands(container, markTestComponents({ Counter }), {
			hydrationTable: config.hydrationTable
		})
	).toBe(1);
	expect(container.querySelector('button')?.textContent).toBe('Compact');
});
