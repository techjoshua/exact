import { describe, expect, it } from 'vitest';
import { createExactRemoteArtifactPlan, resolveExactBuildKey } from './build.js';

const buildKey = '0123456789abcdef0123456789abcdef01234567';

describe('remote artifact planning', () => {
	it('creates deterministic package-relative roots and canonical virtual entries', () => {
		const plan = createExactRemoteArtifactPlan(
			{
				exposes: {
					'./BillingArea': { component: './src/BillingArea.tsx' },
					'./AccountArea': { component: './src/AccountArea.tsx' }
				},
				remotes: {},
				providedPackages: ['@company/contexts']
			},
			{ packageName: '@company/billing', buildKey }
		);

		expect(plan.exposures.map((value) => value.root)).toEqual([
			'@company/billing#./AccountArea',
			'@company/billing#./BillingArea'
		]);
		expect(plan.providedPackages).toContain('@exactjs/core');
		expect(plan.providedPackages).toContain('@company/contexts');
		expect(plan.exposures[0]?.entrySource).toContain(`buildKey: "${buildKey}"`);
	});

	it('accepts only a full Git SHA from build configuration', () => {
		expect(resolveExactBuildKey({ buildKey: buildKey.toUpperCase() })).toBe(buildKey);
		expect(() => resolveExactBuildKey({ buildKey: 'release-12' })).toThrow(/full Git commit SHA/);
	});
});
