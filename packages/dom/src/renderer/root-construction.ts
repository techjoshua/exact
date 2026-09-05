import {
	ErrorContext,
	LoggerContext,
	type Child,
	type ComponentContextValues,
	type ComponentDomain
} from '@exactjs/core';
import {
	componentDomainLogging,
	createFrameworkComponentDomain
} from '@exactjs/core/framework/component-domains';
import type { RenderOptions, Root } from '../types.js';
import {
	isOpaqueOperation,
	opaqueOperationDomain
} from '@exactjs/core/runtime/component-operations';
import { normalizeTreeDepth, normalizeTreeNodes } from './limits.js';
import { createDomErrorContext, createRootErrorView } from './root-support.js';
import { patchChildren } from './patching/children.js';
import { afterMountedChildren } from '../placement.js';

/** Defines renderer-root modes selected by mounting and hydration entry points. */
export type RendererRootConstruction = {
	readonly version: number;
	readonly mode?: Root['mode'];
	readonly markerlessHydration?: boolean;
};

/** Constructs the common renderer-root state shared by mount and adoption entry points. */
export function createRendererRoot(
	container: Element,
	current: Child,
	options: RenderOptions,
	construction: RendererRootConstruction
): Root {
	const domain =
		childDomain(current) ??
		options.componentDomain ??
		(options.inspection
			? createFrameworkComponentDomain({
					executionRoot: options.inspection.executionRoot,
					inspection: options.inspection,
					logger: options.logger
				})
			: undefined);
	const errors = createDomErrorContext(options, () => renderRootErrorView(root));
	const ambientEntries: Array<readonly [symbol, unknown]> = [[ErrorContext.id, errors]];
	if (options.logger) ambientEntries.push([LoggerContext.id, options.logger]);
	const ambientContexts: ComponentContextValues = new Map(ambientEntries);
	const root: Root = {
		container,
		delegated: new Map(),
		errors,
		portalTargets: new Set(),
		current,
		version: construction.version,
		...(domain ? { domain } : {}),
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
		componentLogging: domain ? componentDomainLogging(domain) : undefined,
		ambientContexts,
		enhancementCatalog: options.enhancementCatalog,
		...(construction.mode ? { mode: construction.mode } : {}),
		...(construction.markerlessHydration ? { markerlessHydration: true } : {})
	};
	return root;
}

/** Replaces an initialized root's failed output with its accumulated framework error view. */
export function renderRootErrorView(root: Root): void {
	const mounted = root?.mounted;
	if (!mounted || root.errors.errors.length === 0) return;
	mounted.children = patchChildren(
		root,
		root.container,
		mounted.children,
		[createRootErrorView(root.errors.errors)],
		mounted.instance,
		mounted.scope,
		afterMountedChildren(mounted),
		mounted
	);
}

/** Reads compiler-owned domain identity without interpreting the operation's output. */
export function childDomain(value: Child): ComponentDomain | undefined {
	return isOpaqueOperation(value) ? opaqueOperationDomain(value) : undefined;
}
