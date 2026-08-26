/**
 * @vitest-environment jsdom
 */
import { createVNode } from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { render } from './index.js';

describe('@exactjs/dom component identity', () => {
	it('rejects an unbranded function at the native renderer boundary', () => {
		function ForeignComponent() {
			return () => createVNode('p', null, 'foreign');
		}

		const container = document.createElement('main');
		render(createVNode(ForeignComponent, null), container);

		expect(container.textContent).toContain(
			'Native eXact component execution requires a compiled component artifact'
		);
	});
});
