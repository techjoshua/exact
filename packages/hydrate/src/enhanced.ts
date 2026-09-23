import { withExactEnhancementCatalog } from '@exactjs/core/framework/enhancement-catalog';
import type { Child } from '@exactjs/core';
import { registerDomEnhancementIntegration } from '@exactjs/dom/framework/enhancements';
import { hydrate as hydrateDom } from './runtime/full-hydration.js';
import type { HydrateOptions, HydrationRoot } from './types.js';

export * from './public.js';

/** Hydrates with the compiler-observed enhancement components in this application bundle. */
export function hydrate(
	operation: Child,
	container: Element | Document,
	options: HydrateOptions = {}
): HydrationRoot {
	registerDomEnhancementIntegration();
	return hydrateDom(operation, container, withExactEnhancementCatalog(options));
}

import * as compiled from './framework/component-root.js';
export * from './framework/component-root.js';

/** Adopts compiler-selected roots using the application enhancement catalog. */
export const hydrateCompiledComponentRoot: typeof compiled.hydrateCompiledComponentRoot = (
	operation,
	container,
	options
) => {
	registerDomEnhancementIntegration();
	return compiled.hydrateCompiledComponentRoot(
		operation,
		container,
		withExactEnhancementCatalog(options)
	);
};

/** Adopts compiler-selected roots using the application enhancement catalog. */
export const hydrateCompiledComponentRootAfterNavigation: typeof compiled.hydrateCompiledComponentRootAfterNavigation =
	(operation, container, options) => {
		registerDomEnhancementIntegration();
		return compiled.hydrateCompiledComponentRootAfterNavigation(
			operation,
			container,
			withExactEnhancementCatalog(options)
		);
	};
