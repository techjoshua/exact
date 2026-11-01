import type { RenderOptions, Root } from '../types.js';

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
