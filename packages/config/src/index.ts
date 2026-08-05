import type { ExactPluginConfigContext, ExactPluginConfigTransform } from '@exactjs/plugin-api';
import type { ExactConfig } from './contracts.js';

export type {
	ExactComponentLibraryRule,
	ExactComponentLibraryTrustConfig,
	ExactConfig,
	ExactDebugBuildConfig,
	ExactPluginConfigRegistry,
	ExactPluginDiscoveryConfig
} from './contracts.js';

/** Performs the define config domain operation. */
export function defineConfig<const T extends ExactConfig>(config: T): T {
	return config;
}

export type { ExactPluginConfigContext, ExactPluginConfigTransform };
