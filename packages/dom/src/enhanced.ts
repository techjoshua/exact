import { withExactEnhancementCatalog } from '@exactjs/core/framework/enhancement-catalog';
import type { VNode } from '@exactjs/core';
import { render as renderDom } from './renderer/root-lifecycle.js';
import type { RenderOptions } from './types.js';

export * from './public.js';

/** Renders with the compiler-observed enhancement components in this application bundle. */
export function render(vnode: VNode, container: Element, options: RenderOptions = {}): void {
	return renderDom(vnode, container, withExactEnhancementCatalog(options));
}
