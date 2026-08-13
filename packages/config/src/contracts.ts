import type { ExactInspectionRedactionCatalog } from '@exactjs/devtools-protocol';
import type {
	ExactLanguageDiagnosticSeverity,
	ExactLanguageProviderConfigRegistry
} from '@exactjs/language-extension-api';
import type { ExactPluginConfigTransform } from '@exactjs/plugin-api';

/** Defines the exact plugin config registry interface contract. */
export interface ExactPluginConfigRegistry {}

/** Language-assistance roles that applications can independently disable. */
export type ExactLanguageExtensionRole =
	| 'declarative'
	| 'analyzer'
	| 'diagnostics'
	| 'completions'
	| 'hover'
	| 'inlayHints'
	| 'codeActions';

/** Selects one physical package instance for analyzer policy. */
export type ExactLanguagePackageRule =
	| string
	| Readonly<{ package: string; version?: string; integrity?: string }>;

/** Disables roles by package selection or canonical provider identity. */
export type ExactLanguageIgnoreRule = (
	| Readonly<{ package: string; version?: string; integrity?: string; provider?: never }>
	| Readonly<{ provider: string; package?: never }>
) &
	Readonly<{ roles: readonly ExactLanguageExtensionRole[] }>;

/** Selects provider diagnostics for shared CI-equivalent policy. */
export interface ExactLanguageDiagnosticSelector {
	readonly provider: string;
	readonly codes: readonly string[];
	readonly paths?: readonly string[];
}

/** Configures trusted development-time language contributions. */
export interface ExactLanguageExtensionsConfig {
	readonly analyzers?: Readonly<{
		mode?: 'off' | 'root' | 'trusted' | 'all';
		allow?: readonly ExactLanguagePackageRule[];
		deny?: readonly ExactLanguagePackageRule[];
		trustedScopes?: readonly string[];
		includeDefaultTrustedScopes?: boolean;
	}>;
	readonly ignore?: readonly ExactLanguageIgnoreRule[];
	readonly providers?: Partial<ExactLanguageProviderConfigRegistry>;
	readonly diagnostics?: Readonly<{
		providerFailures?: 'error' | 'warning';
		ignore?: readonly ExactLanguageDiagnosticSelector[];
		severity?: readonly (ExactLanguageDiagnosticSelector &
			Readonly<{ severity: ExactLanguageDiagnosticSeverity }>)[];
	}>;
}

/** One statically declared enhancement binding available to every component in a package. */
export interface ExactPackageEnhancementImport {
	readonly localName: string;
	readonly moduleSpecifier: string;
	/** Package declarations are namespace exports; compilation synthesizes the matching namespace import. */
	readonly importKind: 'namespace';
	/** Configuration module that owns relative module-specifier resolution. */
	readonly declaredIn: string;
}

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
	/** Development-time package language assistance and compilation validation policy. */
	languageExtensions?: ExactLanguageExtensionsConfig;
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
