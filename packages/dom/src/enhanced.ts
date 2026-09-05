import { withExactEnhancementCatalog } from '@exactjs/core/framework/enhancement-catalog';
import type { Child } from '@exactjs/core';
import { registerDomEnhancementIntegration } from './renderer/enhancement-integration.js';
import { renderCompiledComponentRoot } from './framework/component-root.js';
import type { RenderOptions } from './types.js';

export * from './public.js';

/** Renders with the compiler-observed enhancement components in this application bundle. */
export function render(operation: Child, container: Element, options: RenderOptions = {}): void {
	registerDomEnhancementIntegration();
	return renderCompiledComponentRoot(operation, container, withExactEnhancementCatalog(options));
}
