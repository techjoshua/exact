/**
 * @vitest-environment jsdom
 */
import {
	render,
	renderCompiledComponentInputRoot,
	createComponentRootAdoption,
	unmount
} from './enhanced.js';
import { registerExactEnhancement } from '@exactjs/core/framework/enhancement-catalog';
import { describe, expect, it } from 'vitest';
import { CatalogAsideEnhancement, createCatalogEnhancedButtonRoot } from './enhanced.fixtures.js';

describe('enhanced DOM facade', () => {
	it('forwards the receiving token through enhanced root mount, update and disposal', () => {
		const identity = '@exactjs/dom:enhanced-receiving-owner';
		registerExactEnhancement(identity, CatalogAsideEnhancement);
		const container = document.createElement('div');
		const adoption = createComponentRootAdoption(container);
		try {
			renderCompiledComponentInputRoot(
				createCatalogEnhancedButtonRoot(identity),
				container,
				{},
				adoption
			);
			expect(adoption.isCurrent()).toBe(true);
			render(createCatalogEnhancedButtonRoot(identity), container);
			expect(adoption.isCurrent()).toBe(false);
			const next = createComponentRootAdoption(container);
			renderCompiledComponentInputRoot(
				createCatalogEnhancedButtonRoot(identity),
				container,
				{},
				next
			);
			expect(next.isCurrent()).toBe(true);
			unmount(container);
			expect(next.isCurrent()).toBe(false);
		} finally {
			unmount(container);
		}
	});

	it('supplies the application-bundle catalog by default', () => {
		const identity = '@exactjs/dom:enhanced-facade';
		registerExactEnhancement(identity, CatalogAsideEnhancement);
		const container = document.createElement('div');

		render(createCatalogEnhancedButtonRoot(identity), container);

		expect(container.querySelector('aside > button')?.textContent).toBe('Save');
	});
});
