import type { ExactPluginConfigContext, ExactPluginConfigTransform } from '@exactjs/plugin-api';
import type { ExactConfig } from './contracts.js';
import { normalizeExactConfig } from './normalization.js';

export type {
	ExactAnalysisOptions,
	ExactComponentLibraryRule,
	ExactComponentLibraryTrustConfig,
	ExactConfig,
	ExactDebugBuildConfig,
	ExactLanguageDiagnosticSelector,
	ExactLanguageExtensionRole,
	ExactLanguageExtensionsConfig,
	ExactLanguageIgnoreRule,
	ExactLanguagePackageRule,
	ExactPackageEnhancementImport,
	ExactPluginConfigRegistry,
	ExactPluginDiscoveryConfig
} from './contracts.js';

/** Validates built-in options while retaining authored values, callback identity, and plugin types. */
export function defineConfig<const T extends ExactConfig>(config: T): T {
	return normalizeExactConfig(config);
}

export { normalizeExactConfig } from './normalization.js';

export type { ExactPluginConfigContext, ExactPluginConfigTransform };
