import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadExactIntlCatalogFiles } from './catalog-files.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
	);
});

describe('intl catalog files', () => {
	it('recognizes both standard XLIFF filename extensions without parsing them as JSON', async () => {
		const directory = await mkdtemp(path.join(tmpdir(), 'exact-intl-catalogs-'));
		temporaryDirectories.push(directory);
		const document = '<xliff version="2.1" trgLang="fr"></xliff>';
		await writeFile(path.join(directory, 'fr.xlf'), document);
		await writeFile(path.join(directory, 'fr-CA.xliff'), document.replace('fr"', 'fr-CA"'));

		const loaded = await loadExactIntlCatalogFiles(directory, ['fr.xlf', 'fr-CA.xliff']);

		expect(loaded.catalogs).toEqual([]);
		expect(loaded.xliff.map(({ locale }) => locale)).toEqual(['fr', 'fr-CA']);
	});
});
