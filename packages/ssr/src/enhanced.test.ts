import { createEnhancementNode } from '@exactjs/core';
import { registerExactEnhancement } from '@exactjs/core/framework/enhancement-catalog';
import { describe, expect, it } from 'vitest';
import { renderToString } from './enhanced.js';
import { createOperation } from './test-support/native-operations.js';
import { FacadeEnhancement } from './enhanced.fixtures.test.js';

describe('enhanced SSR facade', () => {
	it('supplies the application-bundle catalog by default', () => {
		const identity = '@exactjs/ssr:enhanced-facade';
		registerExactEnhancement(identity, FacadeEnhancement);

		const output = renderToString(
			createOperation(
				'button',
				{ __exactEnhancements: createEnhancementNode([{ identity, props: {} }]) },
				'Save'
			),
			{ markers: false }
		);

		expect(output.html).toBe('<aside><button>Save</button></aside>');
	});
});
