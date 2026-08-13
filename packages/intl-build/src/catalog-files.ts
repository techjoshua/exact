import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Resolved catalog files and their flattened data-only catalog payloads. */
export type ExactLoadedIntlCatalogFiles = Readonly<{
	files: readonly string[];
	catalogs: readonly unknown[];
	xliff: readonly Readonly<{ filename: string; input: string; locale: string }>[];
}>;

/** Loads configured JSON catalogs and defers XLIFF lowering until descriptors are linked. */
export async function loadExactIntlCatalogFiles(
	applicationRoot: string,
	files: readonly string[] | undefined
): Promise<ExactLoadedIntlCatalogFiles> {
	const resolved = Object.freeze((files ?? []).map((file) => path.resolve(applicationRoot, file)));
	const catalogs: unknown[] = [];
	const xliff: { filename: string; input: string; locale: string }[] = [];
	for (const file of resolved) {
		try {
			const input = await readFile(file, 'utf8');
			if (/\.(?:xlf|xliff)$/iu.test(file)) {
				const locale = /\btrgLang="([^"]+)"/u.exec(input)?.[1];
				if (!locale) throw new TypeError('XLIFF catalog requires trgLang');
				xliff.push({ filename: file, input, locale });
				continue;
			}
			const parsed = JSON.parse(input) as unknown;
			catalogs.push(...(Array.isArray(parsed) ? parsed : [parsed]));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			throw new Error(`Unable to load intl catalog file ${file}: ${message}`);
		}
	}
	return Object.freeze({
		files: resolved,
		catalogs: Object.freeze(catalogs),
		xliff: Object.freeze(xliff)
	});
}
