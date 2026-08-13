import type { IntlCatalogV1, IntlRuntimeDescriptorV1 } from '@exactjs/intl';
import { validateIntlCatalog } from '@exactjs/intl/internal';
import { exportXliff21Catalog, importXliff21Catalog } from './xliff-interchange.js';

const maximumInterchangeLength = 10 * 1024 * 1024;

/** Converts an external translation representation to and from validated protocol-1 catalogs. */
export interface IntlCatalogInterchangeAdapter<External = string> {
	readonly format: string;
	exportCatalog(catalog: unknown, descriptors: readonly IntlRuntimeDescriptorV1[]): External;
	importCatalog(input: External, descriptors: readonly IntlRuntimeDescriptorV1[]): IntlCatalogV1;
}

/** Lossless JSON adapter for generated services that preserve eXact's data-only message IR. */
export const exactJsonCatalogInterchange: IntlCatalogInterchangeAdapter = Object.freeze({
	format: 'exact-json-v1',
	exportCatalog(catalog: unknown, descriptors: readonly IntlRuntimeDescriptorV1[]): string {
		return `${JSON.stringify(validateIntlCatalog(catalog, descriptors), null, 2)}\n`;
	},
	importCatalog(input: string, descriptors: readonly IntlRuntimeDescriptorV1[]): IntlCatalogV1 {
		boundedInterchange(input);
		return validateIntlCatalog(JSON.parse(input) as unknown, descriptors);
	}
});

/** Translator-facing XLIFF 2.1 adapter with standard inline codes and bounded eXact metadata. */
export const xliff21CatalogInterchange: IntlCatalogInterchangeAdapter = Object.freeze({
	format: 'xliff-2.1',
	exportCatalog: exportXliff21Catalog,
	importCatalog: importXliff21Catalog
});

function boundedInterchange(input: string): void {
	if (typeof input !== 'string' || input.length > maximumInterchangeLength)
		throw new TypeError(
			`Intl interchange must be a string no larger than ${maximumInterchangeLength} bytes`
		);
}
