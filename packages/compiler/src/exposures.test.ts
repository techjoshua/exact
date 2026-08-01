import { describe, expect, it } from 'vitest';
import type { ExactArtifactGraph } from './contracts/artifacts.js';
import {
	exactReachableExposureComponents,
	selectExactExposureArtifactGraph,
	selectExactExposureInspectionCatalog
} from './exposures.js';

describe('exposure artifact graph selection', () => {
	it('selects only modules reachable from the explicit component root', () => {
		const graph = fixtureGraph();
		expect([...exactReachableExposureComponents(graph, 'billing')]).toEqual(['billing', 'button']);
		const selected = selectExactExposureArtifactGraph(graph, 'billing');
		expect(selected.artifacts.map((artifact) => artifact.inputFile)).toEqual([
			'/src/billing.tsx',
			'/src/button.tsx'
		]);
		expect(selected.clientIslands.map((entry) => entry.componentId)).toEqual(['button']);
		expect(selected.serverParts.map((entry) => entry.componentId)).toEqual(['billing']);
	});

	it('fails when configuration does not name a compiled component root', () => {
		expect(() => selectExactExposureArtifactGraph(fixtureGraph(), 'missing')).toThrow(
			/Unknown eXact exposure root/
		);
	});

	it('partitions server-owned inspection data to the reachable exposure', () => {
		const inspection = {
			generation: 1,
			filename: '/src/components.tsx',
			compiler: { typescriptVersion: '7.0.0', backendVersion: '1.26.0' },
			diagnostics: [],
			components: ['billing', 'button', 'admin'].map((id) => ({
				id,
				kind: 'component' as const,
				name: id,
				range: { start: 0, end: 1 },
				selectionRange: { start: 0, end: 1 },
				children: [],
				reasons: []
			}))
		};
		const catalog = selectExactExposureInspectionCatalog(fixtureGraph(), 'billing', [inspection]);
		expect(catalog.files[0]?.components.map((component) => component.id)).toEqual([
			'billing',
			'button'
		]);
		expect(JSON.stringify(catalog)).not.toContain('admin');
	});
});

function fixtureGraph(): ExactArtifactGraph {
	const artifact = (inputFile: string, id: string) => ({
		inputFile,
		clientFile: `${inputFile}.client.js`,
		serverFile: `${inputFile}.server.js`,
		analysis: {
			version: 1 as const,
			filename: inputFile,
			dependencies: [],
			assets: [],
			components: [
				{
					id,
					name: id,
					exported: true,
					placement: 'isomorphic' as const,
					subgraphPlacement: 'isomorphic' as const,
					renderEdges: [],
					clientIslandCount: 0,
					tasks: [],
					contexts: [],
					splitBoundaries: [],
					diagnostics: []
				}
			],
			exports: [],
			symbols: [],
			boundaries: [],
			callables: [],
			continuations: [],
			resumptions: [],
			policy: {
				version: 1 as const,
				capabilities: [],
				subjects: [],
				flows: [],
				secretConsumers: []
			},
			serverActions: {},
			diagnostics: []
		}
	});
	const billing = artifact('/src/billing.tsx', 'billing');
	const button = artifact('/src/button.tsx', 'button');
	const admin = artifact('/src/admin.tsx', 'admin');
	return {
		conditions: { client: ['exact-client'], server: ['exact-server'] },
		packageExports: {},
		componentEdges: [
			{
				id: 'edge',
				sourceFile: billing.inputFile,
				sourceComponentId: 'billing',
				sourceName: 'Billing',
				targetComponentId: 'button',
				targetName: 'Button',
				tag: 'Button',
				placement: 'client',
				boundary: 'client',
				index: 1,
				path: '0'
			}
		],
		clientIslands: [
			{
				id: 'button-island',
				name: 'Button',
				exportName: 'Button',
				module: 'button',
				componentId: 'button'
			},
			{
				id: 'admin-island',
				name: 'Admin',
				exportName: 'Admin',
				module: 'admin',
				componentId: 'admin'
			}
		],
		serverParts: [
			{
				id: 'billing-part',
				name: 'Billing',
				exportName: 'Billing',
				module: 'billing',
				componentId: 'billing'
			},
			{
				id: 'admin-part',
				name: 'Admin',
				exportName: 'Admin',
				module: 'admin',
				componentId: 'admin'
			}
		],
		artifacts: [billing, button, admin]
	};
}
