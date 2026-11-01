import { writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Loads a valid wide catalog file without using the host's call-argument capacity as a data limit. */
export async function verifyWideCatalogFiles(loadExactIntlCatalogFiles, root) {
	const count = 140_000;
	const catalog = { protocol: 1, locale: 'fr', owner: 'bulk-catalog', messages: {} };
	await writeFile(path.join(root, 'bulk.json'), JSON.stringify(Array(count).fill(catalog)));
	const loaded = await loadExactIntlCatalogFiles(root, ['bulk.json']);
	if (
		loaded.catalogs.length !== count ||
		loaded.catalogs[0]?.owner !== catalog.owner ||
		loaded.catalogs.at(-1)?.locale !== 'fr'
	) {
		throw new Error('Catalog loading lost wide parsed data');
	}
	await writeFile(path.join(root, 'invalid.json'), '{invalid');
	let failure;
	try {
		await loadExactIntlCatalogFiles(root, ['invalid.json']);
	} catch (error) {
		failure = error;
	}
	if (!(failure instanceof Error) || !failure.message.includes('Unable to load intl catalog'))
		throw new Error('Malformed catalog input did not reject');
	await writeFile(path.join(root, 'next.json'), JSON.stringify(catalog));
	const next = await loadExactIntlCatalogFiles(root, ['next.json']);
	if (next.catalogs.length !== 1)
		throw new Error('Catalog loading did not recover after invalid input');
	return loaded;
}
