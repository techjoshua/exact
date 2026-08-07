import type { ExactInspectionRedactionCatalog } from '@exactjs/devtools-protocol';
import type { ExactPluginConfigTransform } from '@exactjs/plugin-api';

/** Defines the exact plugin config registry interface contract. */
export interface ExactPluginConfigRegistry {}

/** Configures exact plugin discovery. */
export type ExactPluginDiscoveryConfig =
	| { mode?: 'root'; ignore?: readonly string[] }
	| {
			mode: 'trusted';
			trustedPackages?: readonly string[];
			trustedPrefixes?: readonly string[];
			includeDefaultTrustedPrefixes?: boolean;
			ignore?: readonly string[];
	  }
	| { mode: 'all'; ignore?: readonly string[] };

/** Selects one package instance eligible for component-library authorization. */
export type ExactComponentLibraryRule =
	| string
	| Readonly<{
			package: string;
			version?: string;
			integrity?: string;
	  }>;

/** Configures server-executing component-library authorization at the build boundary. */
export type ExactComponentLibraryTrustConfig = Readonly<{
	mode?: 'root' | 'trusted' | 'all';
	allow?: readonly ExactComponentLibraryRule[];
	deny?: readonly ExactComponentLibraryRule[];
	trustedScopes?: readonly string[];
	includeDefaultTrustedScopes?: boolean;
	unauthorizedOptionalEnhancements?: 'error' | 'exclude';
}>;

/** Configures exact. */
export interface ExactConfig {
	pluginDiscovery?: ExactPluginDiscoveryConfig;
	/** Authoritative build-time policy for component code that can execute on the server. */
	componentLibraries?: ExactComponentLibraryTrustConfig;
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
