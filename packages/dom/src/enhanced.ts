import { withExactEnhancementCatalog } from '@exactjs/core/framework/enhancement-catalog';
import type { Child } from '@exactjs/core';
import { registerDomEnhancementIntegration } from './renderer/enhancement-integration.js';
import { renderCompiledComponentInputRoot as renderCompiledRoot } from './framework/component-root.js';
import type { RenderOptions } from './types.js';

export * from './public.js';

/** Renders with the compiler-observed enhancement components in this application bundle. */
export function render(operation: Child, container: Element, options: RenderOptions = {}): void {
	registerDomEnhancementIntegration();
	return renderCompiledRoot(operation, container, withExactEnhancementCatalog(options));
}

export * from './framework/component-root.js';
/** Compiler-selected component roots retain the same enhancement policy as public render calls. */
export const renderCompiledComponentInputRoot: typeof renderCompiledRoot = (
	operation,
	container,
	options = {},
	ownership
) => {
	registerDomEnhancementIntegration();
	return renderCompiledRoot(operation, container, withExactEnhancementCatalog(options), ownership);
};
