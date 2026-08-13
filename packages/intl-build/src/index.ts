export {
	IntlBuildCoordinator,
	type IntlBuildConfiguration,
	type IntlBuildCoordinatorOptions
} from './coordinator.js';
export { loadExactIntlCatalogFiles, type ExactLoadedIntlCatalogFiles } from './catalog-files.js';
export {
	exactIntlDescriptorModuleId,
	projectExactIntlCatalogs,
	relinkExactIntlDescriptorModule,
	resolvedExactIntlDescriptorModule,
	resolveExactIntlDescriptorModule,
	type ExactIntlDescriptorModule
} from './descriptor-modules.js';
export { loadIntlPackagePublication, type IntlPackagePublication } from './package-publication.js';
export { discoverIntlPackagePublications } from './package-discovery.js';
export {
	exactJsonCatalogInterchange,
	xliff21CatalogInterchange,
	type IntlCatalogInterchangeAdapter
} from './catalog-interchange.js';
export {
	exportXliff21SourceCatalog,
	synchronizeXliff21Catalog,
	type XliffCatalogSynchronizationOptions,
	type XliffSourceCatalogOptions
} from './xliff-interchange.js';
export {
	createIntlClientCapabilityBootstrap,
	type IntlClientCapabilityProvider
} from './client-capabilities.js';
