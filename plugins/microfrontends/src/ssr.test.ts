import { createVNode } from '@exactjs/core';
import { renderToString } from '@exactjs/ssr';
import { describe, expect, it } from 'vitest';
import { RemoteComponent } from './client.js';

describe('RemoteComponent server rendering', () => {
	it('emits only the page-owned client placeholder', () => {
		const result = renderToString(
			createVNode(RemoteComponent, {
				binding: 'billing',
				fallback: createVNode('p', null, 'Remote unavailable')
			}),
			{ markers: false }
		);

		expect(result.html).toMatch(
			/^<div id="exact-[^"]+" data-exact-remote="billing" data-exact-remote-state="placeholder"><\/div>$/u
		);
		expect(result.html).not.toContain('Remote unavailable');
	});
});
