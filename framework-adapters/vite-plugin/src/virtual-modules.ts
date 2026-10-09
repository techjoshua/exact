import type { IntlBuildCoordinator } from '@exactjs/intl-build';
import type { ExactPluginOptions } from './plugin-contracts.js';
import type { ExactViteDevelopmentEnhancementCatalog } from './development-enhancement-catalog.js';
import type { ExactViteEnhancementFacadeCatalog } from './enhancement-catalog.js';
import { isExactViteOmittedEnhancement } from './component-authorization.js';
import {
	exactDevtoolsRuntimeBootstrap,
	resolvedExactDevtoolsRuntimeModule
} from './debug-output.js';

/** Loads framework-owned virtual JavaScript modules before host-specific integration fallbacks. */
export function loadExactViteVirtualModule(
	id: string,
	owners: {
		developmentCatalog: ExactViteDevelopmentEnhancementCatalog;
		intl: IntlBuildCoordinator;
		enhancementFacadeCatalog: ExactViteEnhancementFacadeCatalog;
		configuredDebug: ExactPluginOptions['debug'];
	}
): string | { code: string; moduleType: 'js' } | undefined {
	const catalog = owners.developmentCatalog.load(id);
	if (catalog) return catalog;
	const intl = owners.intl.load(id);
	if (intl) return { code: intl.code, moduleType: 'js' };
	const enhancement = owners.enhancementFacadeCatalog.load(id);
	if (enhancement) return { code: enhancement, moduleType: 'js' };
	if (isExactViteOmittedEnhancement(id)) return { code: 'export {};\n', moduleType: 'js' };
	if (id === resolvedExactDevtoolsRuntimeModule)
		return { code: exactDevtoolsRuntimeBootstrap(owners.configuredDebug), moduleType: 'js' };
}
