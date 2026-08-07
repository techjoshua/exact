/** @vitest-environment jsdom */
import { createServerBoundary, markFiniteClientBoundary } from '@exactjs/core';
import { renderToHydratableString } from '@exactjs/ssr';
import { expect, it } from 'vitest';
import { hydrateClientIslands, readExactHydrationConfig } from './index.js';
import type { HydrateOptions } from './types.js';
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

it('activates compact interaction islands and releases their shared table afterward', () => {
	const container = document.createElement('main');
	container.innerHTML =
		'<div data-xh="0.0" data-exact-client-hydration="interaction" data-exact-client-generation="1"><button>Open</button></div>';
	function Dialog(props: { label: string }) {
		return () => createVNode('button', null, props.label);
	}
	const options: HydrateOptions = {
		hydrationTable: [1, [['Dialog', ['label'], [['dialog-1', 'Opened']]]]] as const
	};
	expect(hydrateClientIslands(container, markTestComponents({ Dialog }), options)).toBe(0);
	container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	expect(container.querySelector('[data-exact-client-hydrated="true"]')).not.toBeNull();
	expect(container.querySelector('button')?.textContent).toBe('Opened');
	expect(options.hydrationTable).toBeUndefined();
});

it('confines malformed compact rows without invalidating valid sibling coordinates', () => {
	const container = document.createElement('main');
	container.innerHTML = `<div data-xh="0.0"></div><div data-xh="0.1"></div><script type="application/json" id="__exact_hydration">${JSON.stringify(
		{ h: [1, [['Counter', ['label'], [['broken'], ['counter-2', 'Valid']]]]] }
	)}</script>`;
	function Counter(props: { label: string }) {
		return () => createVNode('span', null, props.label);
	}
	const options: HydrateOptions = {
		hydrationTable: readExactHydrationConfig(container).hydrationTable
	};
	expect(hydrateClientIslands(container, markTestComponents({ Counter }), options)).toBe(1);
	expect(
		container.querySelector('[data-xh="0.0"]')?.hasAttribute('data-exact-client-hydrated')
	).toBe(false);
	expect(container.querySelector('[data-xh="0.1"]')?.textContent).toBe('Valid');
});
