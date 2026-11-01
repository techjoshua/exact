/** Creates real package modules and their owned dependency graph for config controls. */
export function createPluginConfigurationFixture(root: string): {
	graph: import('../../plugin-host/src/graph.js').ExactPackageGraph;
	plugin: import('../../plugin-host/src/graph.js').ExactPackageNode;
};

/** Checks callback observations and private discovery/transform identity through public package loading. */
export function verifyPluginConfigurationValues(
	api: {
		discoverExactPlugins: typeof import('../../plugin-host/src/discovery.js').discoverExactPlugins;
		resolveExactPluginConfigurations: typeof import('../../plugin-host/src/configuration.js').resolveExactPluginConfigurations;
		importPublicPackageEntry: typeof import('../../plugin-host/src/modules.js').importPublicPackageEntry;
	},
	root: string
): Promise<true>;
