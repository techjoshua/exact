import type { loadExactIntlCatalogFiles } from '../../intl-build/src/catalog-files.js';
/** Checks wide valid data, malformed JSON rejection, and the next file load on filesystem hosts. */
export function verifyWideCatalogFiles(
	load: typeof loadExactIntlCatalogFiles,
	root: string
): ReturnType<typeof loadExactIntlCatalogFiles>;
