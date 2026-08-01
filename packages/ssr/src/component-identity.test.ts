import { createVNode } from '@exactjs/core';
import { describe, expect, it } from 'vitest';
import { renderToString } from './index.js';

describe('@exactjs/ssr component identity', () => {
	it('rejects an unbranded function at the native renderer boundary', () => {
		function ForeignComponent() {
			return () => createVNode('p', null, 'foreign');
		}

		expect(() => renderToString(createVNode(ForeignComponent, null))).toThrow(
			'Native eXact components require compiler-owned identity'
		);
	});
});
