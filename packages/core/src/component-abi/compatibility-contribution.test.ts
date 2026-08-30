import { describe, expect, it, vi } from 'vitest';
import {
	compatibilityContributionKey,
	createCompatibilityContribution,
	isCompatibilityContribution,
	placeCompatibilityContribution
} from './compatibility-contribution.js';

describe('opaque compatibility contributions', () => {
	it('exposes only opaque placement and optional foreign-owner identity', () => {
		const operation = vi.fn((target: { place(value: unknown): object }) => target.place('owned'));
		const contribution = createCompatibilityContribution(operation, 'stable-child');
		const place = vi.fn(() => Object.freeze({ mounted: true }));

		expect(isCompatibilityContribution(contribution)).toBe(true);
		expect(compatibilityContributionKey(contribution)).toBe('stable-child');
		expect(Object.keys(contribution)).toEqual([]);
		expect(Object.isFrozen(contribution)).toBe(true);
		expect('type' in contribution).toBe(false);
		expect('kind' in contribution).toBe(false);
		expect('children' in contribution).toBe(false);
		expect('materialize' in contribution).toBe(false);
		expect(placeCompatibilityContribution(contribution, { place })).toEqual({ mounted: true });
		expect(operation).toHaveBeenCalledOnce();
		expect(place).toHaveBeenCalledWith('owned');
	});

	it('rejects malformed creation and invocation inputs', () => {
		expect(() => createCompatibilityContribution(null as never)).toThrow(TypeError);
		expect(() => compatibilityContributionKey({} as never)).toThrow(TypeError);
		expect(() => placeCompatibilityContribution({} as never, { place: () => ({}) })).toThrow(
			TypeError
		);
	});
});
