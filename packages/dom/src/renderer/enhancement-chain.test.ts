import { describe, expect, it } from 'vitest';
import type { Root } from '../types.js';
import { orderEnhancementEntries } from './enhancement-chain.js';

describe('enhancement ordering', () => {
	it('bypasses graph planning for a singleton chain', () => {
		const entry = { identity: 'motion', props: { value: 1 } };
		const rootWithoutCatalog = {} as Root;

		expect(orderEnhancementEntries(rootWithoutCatalog, [entry])).toEqual([entry]);
	});
});
