import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it, onTestFinished } from 'vitest';
import { loadExactIntlCatalogFiles } from './catalog-files.js';
import { IntlBuildCoordinator } from './coordinator.js';
import { verifyWideCatalogFiles } from '../../component-composition-corpus/test-support/wide-catalog-journey.mjs';

it('loads wide valid catalog files and retains malformed-input rejection and later progress', async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), 'exact-catalog-width-'));
	onTestFinished(() => rm(root, { recursive: true, force: true }));
	await verifyWideCatalogFiles(loadExactIntlCatalogFiles, root);
});

it('registers a wide package publication without converting catalogs into call arguments', () => {
	const catalog = { protocol: 1, locale: 'fr', owner: 'bulk-catalog', messages: {} };
	const coordinator = new IntlBuildCoordinator({
		configuration: { owner: 'application', sourceLocale: 'en-US' }
	});
	try {
		coordinator.registerPackagePublication({
			packageName: catalog.owner,
			packageRoot: '/package',
			metadata: { protocol: 1, sourceLocale: 'en-US', messages: './messages' },
			descriptors: [],
			catalogs: Array(140_000).fill(catalog),
			files: []
		});
		expect(coordinator.catalogs).toHaveLength(140_000);
		expect(coordinator.catalogs[0]).toBe(catalog);
		expect(coordinator.catalogs.at(-1)).toBe(catalog);
	} finally {
		coordinator.dispose();
	}
});
