/**
 * @vitest-environment jsdom
 */
import { createEnhancementNode } from '@exactjs/core';
import { registerExactEnhancement } from '@exactjs/core/framework/enhancement-catalog';
import { describe, expect, it } from 'vitest';
import {
	domEnhancementCapability,
	registerDomEnhancementCapability
} from './renderer/enhancement-capability.js';
import { createOperation } from './test-support/native-operations.js';
import { renderTestTree as render } from './testing.js';
import { LateAsideEnhancement } from './enhanced.fixtures.js';

describe('DOM enhancement capability activation', () => {
	it('activates from a later-loaded module after the renderer root already exists', async () => {
		delete (globalThis as typeof globalThis & Record<PropertyKey, unknown>)[
			Symbol.for('@exactjs/dom.enhancement-capability.v1')
		];
		const container = document.createElement('div');
		render(createOperation('p', null, 'Before'), container);
		expect(container.innerHTML).toBe('<p>Before</p>');
		expect(domEnhancementCapability()).toBeUndefined();

		const { registerDomEnhancementIntegration } = await import('./framework/enhancements.js');
		registerDomEnhancementIntegration();
		const identity = '@exactjs/dom:late-enhancement-capability';
		registerExactEnhancement(identity, LateAsideEnhancement);

		render(
			createOperation(
				'button',
				{ __exactEnhancements: createEnhancementNode([{ identity, props: {} }]) },
				'After'
			),
			container
		);

		expect(container.innerHTML).toBe('<aside data-late="true"><button>After</button></aside>');

		const installed = domEnhancementCapability();
		registerDomEnhancementCapability({
			abi: 1,
			has: () => false,
			install: () => undefined,
			activate: (_root, mounted) => mounted,
			patch: (_root, mounted) => mounted
		});
		expect(domEnhancementCapability()).toBe(installed);
	});
});
