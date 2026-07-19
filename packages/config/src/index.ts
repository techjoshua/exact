import type { ExactPluginConfigContext, ExactPluginConfigTransform } from '@exact/plugin-api';

/** Defines the exact plugin config registry interface contract. */
export interface ExactPluginConfigRegistry {}

/** Configures exact plugin discovery. */
export type ExactPluginDiscoveryConfig =
	| {
			mode?: 'root';
			ignore?: readonly string[];
	  }
	| {
			mode: 'trusted';
			trustedPackages?: readonly string[];
			trustedPrefixes?: readonly string[];
			includeDefaultTrustedPrefixes?: boolean;
			ignore?: readonly string[];
	  }
	| {
			mode: 'all';
			ignore?: readonly string[];
	  };

/** Configures exact. */
export interface ExactConfig {
	pluginDiscovery?: ExactPluginDiscoveryConfig;
	plugins?: {
		[K in keyof ExactPluginConfigRegistry]?:
			| ExactPluginConfigTransform<ExactPluginConfigRegistry[K]>
			| false;
	};
}

/** Performs the define config domain operation. */
export function defineConfig<const T extends ExactConfig>(config: T): T {
	return config;
}

export type { ExactPluginConfigContext, ExactPluginConfigTransform };
