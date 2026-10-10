import { Accessibility } from '@exactjs/accessibility';
import { describe, expect, it } from 'vitest';
import {
	AccessibilityPage,
	accessibilityEnhancementIdentity
} from './accessibility-enhancement.fixtures.test.js';
import { renderToString, renderToStream } from './index.js';
import { createOperation } from './test-support/native-operations.js';

describe('@exactjs/ssr accessibility enhancement integration', () => {
	it.each(['buffered', 'streamed'])(
		'reserves one relationship identity during %s SSR',
		async (mode) => {
			const operation = createOperation(AccessibilityPage, null);
			const options = {
				markers: false,
				enhancementCatalog: new Map([[accessibilityEnhancementIdentity, Accessibility]])
			};
			const html =
				mode === 'buffered'
					? (await renderToString(operation, options)).html
					: await new Response(renderToStream(operation, options)).text();
			expect(html).not.toContain('data-exact-client-boundary');
			const relationship = /aria-describedby="([^"]+)"/u.exec(html)?.[1];
			expect(relationship).toMatch(/^exact-/u);
			expect(html).toMatch(
				new RegExp(`<span(?=[^>]*\\bid="${relationship}")[^>]*>Cannot be undone</span>`, 'u')
			);
		}
	);
});
