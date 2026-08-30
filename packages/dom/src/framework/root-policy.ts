import type { ComponentDomain } from '@exactjs/core';
import { createFrameworkComponentDomain } from '@exactjs/core/framework/component-domains';
import type { RenderOptions, Root } from '../types.js';

/** Adds the inspection-owned domain required by a compiler-issued root operation. */
export function resolveRootRenderOptions(
	domain: ComponentDomain | undefined,
	root: Root | undefined,
	options: RenderOptions,
	inspection = options.inspection
): RenderOptions {
	return inspection && !domain && !root?.domain && !options.componentDomain
		? {
				...options,
				componentDomain: createFrameworkComponentDomain({
					executionRoot: inspection.executionRoot,
					inspection,
					logger: options.logger
				})
			}
		: options;
}

/** Applies mutable root policy without changing operation or range ownership. */
export function applyRootOptions(root: Root, options: RenderOptions): void {
	root.logger = options.logger;
	root.debugMarkers = options.debugMarkers ?? false;
	root.workBudget = options.workBudget;
	root.allowUnsafeHtml = options.allowUnsafeHtml ?? root.allowUnsafeHtml;
	root.onUnsafeHtml = options.onUnsafeHtml ?? root.onUnsafeHtml;
	root.onProfile = options.onProfile ?? root.onProfile;
	root.enhancementCatalog = options.enhancementCatalog ?? root.enhancementCatalog;
}
