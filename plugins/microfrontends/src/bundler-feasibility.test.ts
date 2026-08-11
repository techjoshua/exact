import { describe, expect, it } from 'vitest';
import { createExactRemoteArtifactPlan } from './build.js';
import { createExactBunFeasibilityMapping } from './bun-feasibility.js';
import { createExactWebpackFeasibilityMapping } from './webpack-feasibility.js';

const buildKey = '0123456789abcdef0123456789abcdef01234567';

describe('Webpack and Bun remote artifact adapters', () => {
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
			mapping.providedBridge('@exactjs/core', [{ kind: 'named', imported: 'createVNode' }])
		).toContain('as createVNode');
	});

	it('maps the same plan to Bun entrypoints and onResolve/onLoad modules', () => {
		const plan = fixturePlan();
		const mapping = createExactBunFeasibilityMapping({
			plan,
			applicationRoot: '/workspace/remote',
			registrationModules: registration()
		});

		const entrypoint = mapping.entrypoints[0]!;
		expect(entrypoint).toMatch(/^exact-remote:/);
		expect(mapping.onResolve(entrypoint)).toEqual({
			path: entrypoint,
			namespace: 'exact-remote-artifact'
		});
		expect(mapping.onLoad(entrypoint)).toMatchObject({
			loader: 'js',
			contents: expect.stringContaining('export default __exactRemoteModule')
		});
		expect(
			mapping.providedBridge('@exactjs/core', [{ kind: 'named', imported: 'createVNode' }])
		).toMatchObject({ loader: 'js', contents: expect.stringContaining('as createVNode') });
	});

	it('publishes only complete current generations and retains the last accepted build on failure', () => {
		const plan = fixturePlan();
		const entries: Readonly<Record<string, string>>[] = [];
		const webpack = createExactWebpackFeasibilityMapping({
			plan,
			applicationRoot: '/workspace/remote',
			registrationModules: registration(),
			publicPath: '/assets',
			onEntries: (value) => entries.push(value)
		});
		const first = webpack.beginGeneration();
		const accepted = webpack.acceptGeneration(first, [
			{
				name: 'exact-remote-Area',
				fileName: 'area.abc123.mjs',
				type: 'entry'
			},
			{ fileName: 'area.abc123.css', type: 'css' }
		]);
		expect(accepted.entries).toEqual({ './Area': '/assets/area.abc123.mjs' });
		expect(accepted.artifacts['./Area']).toMatchObject({ authorized: true, immutable: true });
		expect(accepted.resources.css).toEqual(['area.abc123.css']);

		const failed = webpack.beginGeneration();
		webpack.rejectGeneration(failed);
		expect(webpack.acceptedGeneration()).toBe(accepted);
		expect(() => webpack.acceptGeneration(failed, [])).toThrow('stale');
		expect(entries).toEqual([accepted.entries]);
	});

	it('indexes Bun outputs by actual entrypoint instead of predicted filenames', () => {
		const plan = fixturePlan();
		const bun = createExactBunFeasibilityMapping({
			plan,
			applicationRoot: '/workspace/remote',
			registrationModules: registration(),
			publicPath: 'https://cdn.example.test/v1'
		});
		const generation = bun.beginGeneration();
		const accepted = bun.acceptGeneration(generation, [
			{
				entrypoint: bun.entrypoints[0]!,
				path: 'chunks/unpredicted-9f.mjs',
				kind: 'entry'
			}
		]);
		expect(accepted.entries['./Area']).toBe(
			'https://cdn.example.test/v1/chunks/unpredicted-9f.mjs'
		);
	});
});

function fixturePlan() {
	return createExactRemoteArtifactPlan(
		{
			exposes: { './Area': { component: './src/Area.tsx' } },
			remotes: {},
			providedPackages: ['@exactjs/core']
		},
		{ packageName: '@company/remote', buildKey }
	);
}

function registration() {
	return { './Area': 'export const exactHydrationRegistration = {};' };
}
