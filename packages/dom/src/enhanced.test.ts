/**
 * @vitest-environment jsdom
 */
import { render } from './enhanced.js';
import { registerExactEnhancement } from '@exactjs/core/framework/enhancement-catalog';
import { describe, expect, it } from 'vitest';
import { CatalogAsideEnhancement, createCatalogEnhancedButtonRoot } from './enhanced.fixtures.js';

describe('enhanced DOM facade', () => {
	it('supplies the application-bundle catalog by default', () => {
		const identity = '@exactjs/dom:enhanced-facade';
		registerExactEnhancement(identity, CatalogAsideEnhancement);
		const container = document.createElement('div');

		render(createCatalogEnhancedButtonRoot(identity), container);

		expect(container.querySelector('aside > button')?.textContent).toBe('Save');
	});
});
