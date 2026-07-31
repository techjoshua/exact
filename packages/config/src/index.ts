import type { ExactPluginConfigContext, ExactPluginConfigTransform } from '@exactjs/plugin-api';
import type { ExactInspectionRedactionCatalog } from '@exactjs/devtools-protocol';

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
	/** Compiler/build output required for client and server DevTools cooperation. */
	debug?: ExactDebugBuildConfig;
	plugins?: {
		[K in keyof ExactPluginConfigRegistry]?:
			| ExactPluginConfigTransform<ExactPluginConfigRegistry[K]>
			| false;
	};
}

/** Independent static controls for server-owned catalogs and compact runtime observation. */
export interface ExactDebugBuildConfig {
	catalog?: boolean | 'auto';
	runtime?: boolean | 'auto';
	buildKey?: string;
	executionRoot?: string;
	rootComponentId?: string;
	producer?: Readonly<{ packageName?: string; version?: string }>;
	redactions?: Partial<ExactInspectionRedactionCatalog>;
}

/** Performs the define config domain operation. */
export function defineConfig<const T extends ExactConfig>(config: T): T {
	return config;
}

export type { ExactPluginConfigContext, ExactPluginConfigTransform };
