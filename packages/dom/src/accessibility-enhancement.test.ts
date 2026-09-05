/**
 * @vitest-environment jsdom
 */
import './framework/enhancements.js';
import '@exactjs/core/runtime/refs';
import { Accessibility } from '@exactjs/accessibility';
import { flushSync } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { renderTestTree as render } from './testing.js';
import { createCompiledComponentOperation } from './test-support/native-operations.js';
import { AccessibilityPage } from './accessibility-enhancement.fixtures.js';

const identity = '@exactjs/accessibility/enhancements#describedBy';

describe('@exactjs/dom accessibility enhancement integration', () => {
	it('publishes a ref relationship without wrapper markup and keeps generated identity', () => {
		const container = document.createElement('div');

		render(createCompiledComponentOperation(AccessibilityPage, null), container, {
			enhancementCatalog: new Map([[identity, Accessibility]]),
			onErrorReport(report) {
				throw report.error;
			}
		});
		flushSync();
		const button = container.querySelector('button')!;
		const help = container.querySelector('span')!;
		expect(button.getAttribute('aria-describedby')).toBe(help.id);
		expect(help.id).toMatch(/^exact-/u);
		expect(container.children).toHaveLength(2);
	});
});
import './runtime/target.js';
