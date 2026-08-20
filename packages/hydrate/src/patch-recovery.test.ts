/**
 * @vitest-environment jsdom
 */
import { createFrameworkComponentDomain } from '@exactjs/core/framework/component-domains';
import { render } from '@exactjs/dom';
import { describe, expect, it } from 'vitest';
import { hydrate } from './index.js';
import { createVNode } from './test-support/native-vnode.js';
import { noopLogger } from './test-support/responses.js';

describe('@exactjs/hydrate patch recovery', () => {
	it('retries an identical vnode after a partially applied hydrated patch fails', () => {
		const container = document.createElement('div');
		container.innerHTML = '<section><span>before</span></section>';
		const domain = createFrameworkComponentDomain({ executionRoot: 'retry-test' });
		hydrate(
			{ ...createVNode('section', null, createVNode('span', null, 'before')), domain },
			container,
			{ logger: noopLogger }
		);
		const next = {
			...createVNode('section', null, createVNode('span', null, 'after')),
			domain
		};
		const children = next.children;
		let reject = true;
		let reads = 0;
		Object.defineProperty(next, 'children', {
			configurable: true,
			get() {
				reads++;
				if (reject) throw new Error('transient child read failure');
				return children;
			}
		});

		render(next, container);
		expect(reads).toBeGreaterThan(0);
		expect(container.textContent).not.toBe('after');
		reject = false;
		render(next, container);

		expect(container.textContent).toBe('after');
	});
});
