/**
 * @vitest-environment jsdom
 */
import '@exactjs/core/runtime/refs';
import { Accessibility as ServerAccessibility } from '../../accessibility/src/components.js?exact-target=server';
import { Accessibility as ClientAccessibility } from '../../accessibility/src/components.js';
import '@exactjs/dom/framework/enhancements';
import '@exactjs/dom/runtime/target';
import { renderToHydratableStringAsync } from '@exactjs/ssr';
import { describe, expect, it } from 'vitest';
import { accessibilityPageRoot as serverAccessibilityPageRoot } from './test-support/accessibility-adoption.fixtures.js?exact-target=server';
import { accessibilityPageRoot as clientAccessibilityPageRoot } from './test-support/accessibility-adoption.fixtures.js';
import { hydrate } from './index.js';
import { noopLogger } from './test-support/responses.js';

const identity = '@exactjs/accessibility/enhancements#labelledBy';

describe('@exactjs/hydrate accessibility identity adoption', () => {
	it('retains the server relationship and generated target ID while adopting nodes', async () => {
		const enhancementCatalog = new Map([[identity, ClientAccessibility]]);
		const serverEnhancementCatalog = new Map([[identity, ServerAccessibility]]);
		const container = document.createElement('div');
		const rendered = await renderToHydratableStringAsync(serverAccessibilityPageRoot, {
			markers: false,
			enhancementCatalog: serverEnhancementCatalog
		});
		container.innerHTML = rendered.html;
		const serverLabel = container.querySelector('span')!;
		const serverInput = container.querySelector('input')!;
		const id = serverLabel.id;

		hydrate(clientAccessibilityPageRoot, container, {
			allowMarkerless: true,
			enhancementCatalog,
			logger: noopLogger,
			onMismatch: 'throw',
			resumptions: rendered.resumptions,
			onErrorReport(report) {
				throw report.error;
			}
		});

		expect(container.querySelector('span')).toBe(serverLabel);
		expect(container.querySelector('input')).toBe(serverInput);
		expect(container.querySelector('span')?.id).toBe(id);
		expect(container.querySelector('input')?.getAttribute('aria-labelledby')).toBe(id);
		expect(serverInput.getAttribute('aria-labelledby')).toBe(id);
	});
});
