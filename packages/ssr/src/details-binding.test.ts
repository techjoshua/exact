import { describe, expect, it } from 'vitest';
import { renderToString } from './index.js';
import { createOperation } from './test-support/native-operations.js';

describe('@exactjs/ssr details binding', () => {
	it('marks the server default for dirty hydration adoption without serializing handlers', () => {
		const html = renderToString(
			createOperation('details', { open: false, __exactBindToggle: () => {} }, 'More')
		).html;
		expect(html).toContain('data-exact-ssr-open="false"');
		expect(html).not.toContain('__exactBindToggle');
	});
});
