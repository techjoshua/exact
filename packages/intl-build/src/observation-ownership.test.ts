import { expect, it } from 'vitest';
import { build } from 'esbuild';
import { verifyIntlGeneratedObservations } from '../../component-composition-corpus/test-support/intl-protocol-journey.mjs';
import { exactJsonCatalogInterchange, xliff21CatalogInterchange } from './catalog-interchange.js';
import { projectExactIntlCatalogs, relinkExactIntlDescriptorModule } from './descriptor-modules.js';
import { IntlBuildCoordinator } from './coordinator.js';

it('returns ordinary independent build observations and writable interchange methods', () => {
	const linked = relinkExactIntlDescriptorModule(
		'virtual:observation',
		'export const descriptors = [];\nexport const generation = 0;\n',
		[],
		[],
		1,
		'/src/Owned.tsx',
		['temporal']
	);
	const generation: { generation: number } = linked;
	generation.generation = 99;
	expect(linked.generation).toBe(99);
	const requirements: { length: number } = linked.clientRequirements;
	requirements.length = 0;
	expect(linked.clientRequirements).toHaveLength(0);
	const coordinator = new IntlBuildCoordinator({
		configuration: { owner: 'build-observation', sourceLocale: 'en-US', catalogs: [{}] }
	});
	try {
		const first: { length: number } = coordinator.catalogs;
		first.length = 0;
		expect(coordinator.catalogs).toHaveLength(1);
	} finally {
		coordinator.dispose();
	}
	for (const adapter of [exactJsonCatalogInterchange, xliff21CatalogInterchange]) {
		const original = adapter.exportCatalog;
		try {
			adapter.exportCatalog = () => 'observed';
			expect(adapter.exportCatalog({}, [])).toBe('observed');
		} finally {
			adapter.exportCatalog = original;
		}
	}
	expect(projectExactIntlCatalogs([], [])).toEqual([]);
});

it('executes linked catalog and requirement exports as ordinary generated data', async () => {
	const linked = relinkExactIntlDescriptorModule(
		'virtual:build-observation',
		'export const descriptors = [];\nexport const generation = 0;\n',
		[],
		[],
		1,
		'/src/Owned.tsx',
		['temporal']
	);
	const output = await build({
		stdin: { contents: linked.code, resolveDir: process.cwd() },
		bundle: true,
		platform: 'node',
		format: 'esm',
		write: false
	});
	const generated = await import(
		'data:text/javascript,' + encodeURIComponent(output.outputFiles[0]!.text)
	);
	verifyIntlGeneratedObservations(generated);
});
