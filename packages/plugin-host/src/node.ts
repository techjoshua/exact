export {
	discoverExactPlugins,
	resolveDiscoveryPolicy,
	type ExactConfigurationContributor,
	type ExactDiscoveryPolicy,
	type ExactParticipatingPackage,
	type ExactPluginDiscoveryResult,
	type ExactPluginRequirement,
	type ExactSelectedPlugin
} from './discovery.js';
export {
	createExactPackageGraph,
	createInstalledExactPackageGraph,
	createNpmExactPackageGraph,
	dependencyDistance,
	findUp,
	packageName,
	packageVersion,
	type ExactDependencyKind,
	type ExactPackageDependency,
	type ExactPackageGraph,
	type ExactPackageNode
} from './graph.js';
export {
	invalidateExactPluginRegistry,
	prepareExactPluginRegistry,
	syncExactPluginTypes,
	type ExactPreparedEnhancement,
	type ExactPreparedPluginRegistry,
	type PrepareExactPluginRegistryOptions
} from './registry.js';
