import { createComponentInstance, createVNode, renderInstance, type VNode } from '@exactjs/core';
import { createEffectScope, withEffectScope } from '@exactjs/reactive';
import { clearDelegated } from '../../events.js';
import { roots } from '../../state.js';
import type { Mounted, RenderOptions, Root } from '../../types.js';
import {
	countDomWork,
	isDomRenderLimitError,
	normalizeTreeDepth,
	normalizeTreeNodes,
	withDomWork
} from '../limits.js';
import { rerenderComponent } from '../patching/children.js';
import { ownMountedInstance } from '../root-lifecycle.js';
import { refreshComponentRoot } from '../component-roots.js';
import { createDomErrorContext, createRootBoundary } from '../root-support.js';
import { unmountMounted } from '../teardown.js';
import {
	activateEnhancementSubtree,
	installEnhancementReconciliation
} from '../enhancements.js';
import { mount } from '../mounting/root.js';
import { adoptStaticChildren, boundaryMarkers, contentNodesBetween } from './boundaries.js';
import { componentMarkerMatchesType } from './identity.js';
import { constructAdoptedComponent } from './construction.js';

/** Performs the adopt static domain operation. */
export function adoptStatic(
	vnode: VNode,
	container: Element,
	options: RenderOptions = {}
): boolean {
	if (roots.has(container)) return true;
	const markers = boundaryMarkers(container);
	if (!markers) return false;

	const root: Root = {
		container,
		delegated: new Map(),
		errors: createDomErrorContext(options),
		portalTargets: new Set(),
		current: vnode,
		version: 1,
		boundary: undefined as never,
		debugMarkers: false,
		maxTreeDepth: normalizeTreeDepth(options.maxTreeDepth),
		traversalDepth: 0,
		maxTreeNodes: normalizeTreeNodes(options.maxTreeNodes),
		traversedNodes: 0,
		workDepth: 0,
		workBudget: options.workBudget,
		allowUnsafeHtml: options.allowUnsafeHtml ?? false,
		onUnsafeHtml: options.onUnsafeHtml,
		logger: options.logger,
		enhancementCatalog: options.enhancementCatalog
	};
	root.boundary = createRootBoundary(root);
	const scope = createEffectScope();
	const boundaryVNode = createVNode(root.boundary, { version: root.version });
	let mounted: Mounted = {
		vnode: boundaryVNode,
		dom: markers.start,
		end: markers.end,
		scope,
		children: []
	};
	try {
		return withDomWork(root, () => {
			countDomWork(root);
			const instance = withEffectScope(scope, () =>
				createComponentInstance(root.boundary, { version: root.version })
			);
			ownMountedInstance(mounted, instance);
			const rendered = withEffectScope(scope, () =>
				renderInstance(instance, () => rerenderComponent(root, mounted))
			);
			const nodes = contentNodesBetween(markers.start, markers.end);
			const children = adoptStaticChildren(root, rendered, nodes, instance, scope);
			if (!children) {
				unmountMounted(mounted);
				clearDelegated(root);
				return false;
			}
			mounted.children = children;
			mounted = activateAdoptedEnhancements(root, mounted);
			refreshComponentRoot(instance);
			instance.markMounted();
			root.mounted = mounted;
			roots.set(container, root);
			return true;
		});
	} catch (error) {
		unmountMounted(mounted);
		clearDelegated(root);
		if (isDomRenderLimitError(error)) throw error;
		return false;
	} finally {
		root.workBudget = undefined;
	}
}

/** Performs the adopt component root domain operation. */
export function adoptComponentRoot(
	vnode: VNode,
	container: Element,
	options: RenderOptions = {}
): boolean {
	if (typeof vnode.type !== 'function' || roots.has(container)) return false;
	const markers = boundaryMarkers(container);
	if (
		!markers ||
		!markers.start.data.startsWith('exact:component:') ||
		!componentMarkerMatchesType(markers.start, vnode.type)
	)
		return false;
	const root: Root = {
		container,
		delegated: new Map(),
		errors: createDomErrorContext(options),
		portalTargets: new Set(),
		current: vnode,
		version: 1,
		boundary: undefined as never,
		debugMarkers: false,
		maxTreeDepth: normalizeTreeDepth(options.maxTreeDepth),
		traversalDepth: 0,
		maxTreeNodes: normalizeTreeNodes(options.maxTreeNodes),
		traversedNodes: 0,
		workDepth: 0,
		workBudget: options.workBudget,
		allowUnsafeHtml: options.allowUnsafeHtml ?? false,
		onUnsafeHtml: options.onUnsafeHtml,
		logger: options.logger,
		enhancementCatalog: options.enhancementCatalog,
		mode: 'hydrated'
	};
	root.boundary = createRootBoundary(root);
	const scope = createEffectScope();
	let mounted: Mounted = { vnode, dom: markers.start, end: markers.end, scope, children: [] };
	try {
		return withDomWork(root, () => {
			countDomWork(root);
			const instance = withEffectScope(scope, () =>
				constructAdoptedComponent(vnode, options.logicalParent)
			);
			ownMountedInstance(mounted, instance);
			const rendered = withEffectScope(scope, () =>
				renderInstance(instance, () => rerenderComponent(root, mounted))
			);
			const children = adoptStaticChildren(
				root,
				rendered,
				contentNodesBetween(markers.start, markers.end),
				instance,
				scope
			);
			if (!children) {
				unmountMounted(mounted);
				clearDelegated(root);
				return false;
			}
			mounted.children = children;
			mounted = activateAdoptedEnhancements(root, mounted);
			refreshComponentRoot(instance);
			instance.markMounted();
			root.mounted = mounted;
			roots.set(container, root);
			return true;
		});
	} catch (error) {
		unmountMounted(mounted);
		clearDelegated(root);
		if (isDomRenderLimitError(error)) throw error;
		return false;
	} finally {
		root.workBudget = undefined;
	}
}

/** Performs the adopt markerless component root domain operation. */
export function adoptMarkerlessComponentRoot(
	vnode: VNode,
	container: Element,
	options: RenderOptions = {}
): boolean {
	if (typeof vnode.type !== 'function' || roots.has(container)) return false;
	const start = document.createTextNode('');
	const end = document.createTextNode('');
	container.insertBefore(start, container.firstChild);
	container.appendChild(end);
	const root: Root = {
		container,
		delegated: new Map(),
		errors: createDomErrorContext(options),
		portalTargets: new Set(),
		current: vnode,
		version: 1,
		boundary: undefined as never,
		debugMarkers: false,
		maxTreeDepth: normalizeTreeDepth(options.maxTreeDepth),
		traversalDepth: 0,
		maxTreeNodes: normalizeTreeNodes(options.maxTreeNodes),
		traversedNodes: 0,
		workDepth: 0,
		workBudget: options.workBudget,
		allowUnsafeHtml: options.allowUnsafeHtml ?? false,
		onUnsafeHtml: options.onUnsafeHtml,
		logger: options.logger,
		enhancementCatalog: options.enhancementCatalog,
		mode: 'hydrated',
		markerlessHydration: true
	};
	root.boundary = createRootBoundary(root);
	const scope = createEffectScope();
	let mounted: Mounted = { vnode, dom: start, end, scope, children: [] };
	try {
		return withDomWork(root, () => {
			countDomWork(root);
			const instance = withEffectScope(scope, () =>
				constructAdoptedComponent(vnode, options.logicalParent)
			);
			ownMountedInstance(mounted, instance);
			const rendered = withEffectScope(scope, () =>
				renderInstance(instance, () => rerenderComponent(root, mounted))
			);
			const children = adoptStaticChildren(
				root,
				rendered,
				contentNodesBetween(start, end),
				instance,
				scope
			);
			if (!children) {
				unmountMounted(mounted);
				clearDelegated(root);
				throw new Error('markerless root children did not adopt');
			}
			mounted.children = children;
			mounted = activateAdoptedEnhancements(root, mounted);
			refreshComponentRoot(instance);
			instance.markMounted();
			root.mounted = mounted;
			roots.set(container, root);
			return true;
		});
	} catch (error) {
		unmountMounted(mounted);
		clearDelegated(root);
		if (isDomRenderLimitError(error)) throw error;
		return false;
	} finally {
		root.workBudget = undefined;
		if (!roots.has(container)) {
			start.remove();
			end.remove();
		}
	}
}

/** Performs the adopt document root domain operation. */
export function adoptDocumentRoot(
	vnode: VNode,
	documentNode: Document,
	options: RenderOptions = {}
): boolean {
	const container = documentNode.documentElement;
	if (!container || roots.has(container)) return false;
	const start = documentNode.createComment('exact:document-root');
	const end = documentNode.createComment('/exact:document-root');
	documentNode.insertBefore(start, container);
	documentNode.insertBefore(end, container.nextSibling);
	const root: Root = {
		container,
		delegated: new Map(),
		errors: createDomErrorContext(options),
		portalTargets: new Set(),
		current: vnode,
		version: 1,
		boundary: undefined as never,
		debugMarkers: false,
		maxTreeDepth: normalizeTreeDepth(options.maxTreeDepth),
		traversalDepth: 0,
		maxTreeNodes: normalizeTreeNodes(options.maxTreeNodes),
		traversedNodes: 0,
		workDepth: 0,
		workBudget: options.workBudget,
		allowUnsafeHtml: options.allowUnsafeHtml ?? false,
		onUnsafeHtml: options.onUnsafeHtml,
		logger: options.logger,
		enhancementCatalog: options.enhancementCatalog,
		mode: 'document',
		markerlessHydration: true
	};
	root.boundary = createRootBoundary(root);
	const scope = createEffectScope();
	const boundaryVNode = createVNode(root.boundary, { version: root.version });
	let mounted: Mounted = { vnode: boundaryVNode, dom: start, end, scope, children: [] };
	try {
		return withDomWork(root, () => {
			countDomWork(root);
			const instance = withEffectScope(scope, () =>
				createComponentInstance(root.boundary, { version: root.version })
			);
			ownMountedInstance(mounted, instance);
			const rendered = withEffectScope(scope, () =>
				renderInstance(instance, () => rerenderComponent(root, mounted))
			);
			const children = adoptStaticChildren(root, rendered, [container], instance, scope);
			if (!children) {
				unmountMounted(mounted);
				clearDelegated(root);
				return false;
			}
			mounted.children = children;
			mounted = activateAdoptedEnhancements(root, mounted);
			refreshComponentRoot(instance);
			instance.markMounted();
			root.mounted = mounted;
			roots.set(container, root);
			return true;
		});
	} catch (error) {
		unmountMounted(mounted);
		clearDelegated(root);
		if (isDomRenderLimitError(error)) throw error;
		return false;
	} finally {
		root.workBudget = undefined;
		if (!roots.has(container)) {
			start.remove();
			end.remove();
		}
	}
}

/** Activates compiler-carried declarations after their authored DOM has been adopted. */
function activateAdoptedEnhancements(root: Root, mounted: Mounted): Mounted {
	installEnhancementReconciliation(root, (vnode, instance, scope, node) =>
		mount(root, vnode, instance, scope, node, false)
	);
	return activateEnhancementSubtree(
		root,
		mounted,
		undefined,
		undefined,
		(vnode, instance, scope, node) => mount(root, vnode, instance, scope, node, false)
	);
}
