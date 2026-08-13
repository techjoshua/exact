import { NativeIntlAnalyzer } from '@exactjs/intl-analyzer';
import {
	exportXliff21SourceCatalog,
	synchronizeXliff21Catalog,
	xliff21CatalogInterchange
} from '@exactjs/intl-build';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const owner = '@exactjs/sample-intl-testbed';
const sourceLocale = 'en-US';
const targetLocales = ['fr-FR', 'ja-JP', 'ar-EG'];
const sourceFiles = ['src/showcase.tsx', 'src/lazy-showcase.tsx'];
const checking = process.argv.includes('--check');

const analyzer = new NativeIntlAnalyzer();
try {
	const descriptors = [];
	for (const relativeFile of sourceFiles) {
		const filename = path.join(root, relativeFile);
		const source = await readFile(filename, 'utf8');
		const result = analyzer.analyzeSource(source, { filename, owner, sourceLocale });
		if (result.diagnostics.length)
			throw new Error(
				result.diagnostics.map((diagnostic) => `${relativeFile}: ${diagnostic.message}`).join('\n')
			);
		descriptors.push(...result.descriptors);
	}
	const sourceCatalogFile = path.join(root, 'locales', `${sourceLocale}.xlf`);
	const sourceCatalog = exportXliff21SourceCatalog(descriptors, { owner });
	const currentSourceCatalog = await readFile(sourceCatalogFile, 'utf8').catch(() => undefined);
	if (checking) {
		if (currentSourceCatalog !== sourceCatalog)
			throw new Error('Intl source message manifest is stale. Run npm run generate.');
	} else if (currentSourceCatalog !== sourceCatalog) {
		await writeFile(sourceCatalogFile, sourceCatalog, 'utf8');
	}

	const runtimeCatalogs = [];
	for (const locale of targetLocales) {
		const filename = path.join(root, 'locales', `${locale}.xlf`);
		const current = await readFile(filename, 'utf8').catch(() => undefined);
		const synchronized = synchronizeXliff21Catalog(current, descriptors, { owner, locale });
		runtimeCatalogs.push(xliff21CatalogInterchange.importCatalog(synchronized, descriptors));
		if (checking) {
			if (current !== synchronized)
				throw new Error(
					`Intl catalog ${path.relative(root, filename)} is stale. Run npm run generate.`
				);
		} else if (current !== synchronized) {
			await writeFile(filename, synchronized, 'utf8');
		}
	}
	if (!checking) {
		const generatedDirectory = path.join(root, '.exact');
		await mkdir(generatedDirectory, { recursive: true });
		await writeFile(
			path.join(generatedDirectory, 'intl-catalogs.json'),
			`${JSON.stringify(runtimeCatalogs)}\n`,
			'utf8'
		);
	}
} finally {
	analyzer.dispose();
}
