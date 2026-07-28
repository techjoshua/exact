import { computed } from '@exactjs/reactive';
import { describe, expect, it } from 'vitest';
import { normalizeClassValue } from './class-values.js';

describe('class values', () => {
	it('preserves ordered string, array, object, and reactive contributions', () => {
		expect(
			normalizeClassValue([
				'card',
				false,
				computed(() => 'selected'),
				{ disabled: false, compact: computed(() => true) },
				['nested', null, 2]
			])
		).toBe('card selected compact nested 2');
	});

	it('preserves duplicate dynamic tokens rather than changing authored behavior', () => {
		expect(normalizeClassValue(['selected', computed(() => 'selected')])).toBe('selected selected');
	});
});
