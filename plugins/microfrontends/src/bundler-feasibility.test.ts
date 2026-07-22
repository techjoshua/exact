import { describe, expect, it } from 'vitest';
import { createExactRemoteArtifactPlan } from './build.js';
import { createExactBunFeasibilityMapping } from './bun-feasibility.js';
import { createExactWebpackFeasibilityMapping } from './webpack-feasibility.js';

const buildKey = '0123456789abcdef0123456789abcdef01234567';

describe('staged bundler feasibility mappings', () => {
	it('maps the common artifact plan to Webpack entries, ESM chunks, and provider modules', () => {
		const plan = fixturePlan();
		const mapping = createExactWebpackFeasibilityMapping({
			plan,
			applicationRoot: '/workspace/remote',
			registrationModules: registration()
		});

		expect(mapping.entries).toEqual({
			'exact-remote-Area': plan.exposures[0]!.entryId
		});
		expect(mapping.output).toEqual({
			module: true,
			chunkFormat: 'module',
			chunkLoading: 'import',
			publicPath: 'auto'
		});
		expect(mapping.loadVirtualModule(plan.exposures[0]!.entryId)).toContain(
			'export default __exactRemoteModule'
		);
		expect(
			mapping.providedBridge('@exact/core', [{ kind: 'named', imported: 'createVNode' }])
		).toContain('as createVNode');
	});

	it('maps the same plan to Bun entrypoints and onResolve/onLoad modules', () => {
		const plan = fixturePlan();
		const mapping = createExactBunFeasibilityMapping({
			plan,
			applicationRoot: '/workspace/remote',
			registrationModules: registration()
		});

		expect(mapping.entrypoints).toEqual([plan.exposures[0]!.entryId]);
		expect(mapping.onResolve(plan.exposures[0]!.entryId)).toEqual({
			path: plan.exposures[0]!.entryId,
			namespace: 'exact-remote-artifact'
		});
		expect(mapping.onLoad(plan.exposures[0]!.entryId)).toMatchObject({
			loader: 'js',
			contents: expect.stringContaining('export default __exactRemoteModule')
		});
		expect(
			mapping.providedBridge('@exact/core', [{ kind: 'named', imported: 'createVNode' }])
		).toMatchObject({ loader: 'js', contents: expect.stringContaining('as createVNode') });
	});
});

function fixturePlan() {
	return createExactRemoteArtifactPlan(
		{
			exposes: { './Area': { component: './src/Area.tsx' } },
			remotes: {},
			providedPackages: ['@exact/core']
		},
		{ packageName: '@company/remote', buildKey }
	);
}

function registration() {
	return { './Area': 'export const exactHydrationRegistration = {};' };
}
