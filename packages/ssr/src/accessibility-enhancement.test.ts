import { Accessibility } from '@exactjs/accessibility';
import { describe, expect, it } from 'vitest';
import {
	AccessibilityPage,
	accessibilityEnhancementIdentity
} from './accessibility-enhancement.fixtures.test.js';
import { renderToString } from './index.js';
import { createOperation } from './test-support/native-operations.js';

describe('@exactjs/ssr accessibility enhancement integration', () => {
	it('reserves one relationship identity before either intrinsic serializes', async () => {
		const html = (
			await renderToString(createOperation(AccessibilityPage, null), {
				markers: false,
				enhancementCatalog: new Map([[accessibilityEnhancementIdentity, Accessibility]])
			})
		).html;
		const relationship = /aria-describedby="([^"]+)"/u.exec(html)?.[1];
		expect(relationship).toMatch(/^exact-/u);
		expect(html).toMatch(
			new RegExp(`<span(?=[^>]*\\bid="${relationship}")[^>]*>Cannot be undone</span>`, 'u')
		);
	});
});
