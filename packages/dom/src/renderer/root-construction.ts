import { LoggerContext, type ComponentContextValues, type VNode } from '@exactjs/core';
import { componentDomainLogging } from '@exactjs/core/framework/component-domains';
import type { RenderOptions, Root } from '../types.js';
import { normalizeTreeDepth, normalizeTreeNodes } from './limits.js';
import { createDomErrorContext, createRootBoundary } from './root-support.js';

/** Defines renderer-root modes selected by mounting and hydration entry points. */
export type RendererRootConstruction = {
	readonly version: number;
	readonly mode?: Root['mode'];
	readonly markerlessHydration?: boolean;
};

/** Constructs the common renderer-root state shared by mount and adoption entry points. */
export function createRendererRoot(
	container: Element,
	current: VNode,
	options: RenderOptions,
	construction: RendererRootConstruction
): Root {
	const ambientContexts: ComponentContextValues | undefined = options.logger
		? new Map([[LoggerContext.id, options.logger]])
		: undefined;
	const root: Root = {
		container,
		delegated: new Map(),
		errors: createDomErrorContext(options),
		portalTargets: new Set(),
		current,
		version: construction.version,
		boundary: undefined as never,
		debugMarkers: false,
		maxTreeDepth: normalizeTreeDepth(options.maxTreeDepth),
		traversalDepth: 0,
		maxTreeNodes: normalizeTreeNodes(options.maxTreeNodes),
		traversedNodes: 0,
		workDepth: 0,
		focusTransactionDepth: 0,
		workBudget: options.workBudget,
		allowUnsafeHtml: options.allowUnsafeHtml ?? false,
		onUnsafeHtml: options.onUnsafeHtml,
		onProfile: options.onProfile,
		logger: options.logger,
		componentLogging: current.domain ? componentDomainLogging(current.domain) : undefined,
		ambientContexts,
		enhancementCatalog: options.enhancementCatalog,
		...(construction.mode ? { mode: construction.mode } : {}),
		...(construction.markerlessHydration ? { markerlessHydration: true } : {})
	};
	root.boundary = createRootBoundary(root);
	return root;
}
