import { describe, expect, it } from 'vitest';
import { renderToString } from './index.js';
import { createVNode } from './test-support/native-vnode.js';

describe('@exactjs/ssr details binding', () => {
	it('marks the server default for dirty hydration adoption without serializing handlers', () => {
		const html = renderToString(
			createVNode('details', { open: false, __exactBindToggle: () => {} }, 'More')
		).html;
		expect(html).toContain('data-exact-ssr-open="false"');
		expect(html).not.toContain('__exactBindToggle');
	});
});
