import {
	createComponentInstance,
	createVNode,
	renderInstance,
	type ComponentFunction,
	type VNode
} from '@exactjs/core';
import { createEffectScope, withEffectScope } from '@exactjs/reactive';
import { getComponentProps } from '../../children.js';
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
import { createDomErrorContext, createRootBoundary } from '../root-support.js';
import { unmountMounted } from '../teardown.js';
import { adoptStaticChildren, boundaryMarkers, contentNodesBetween } from './boundaries.js';

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
		logger: options.logger
	};
	root.boundary = createRootBoundary(root);
	const scope = createEffectScope();
	const boundaryVNode = createVNode(root.boundary, { version: root.version });
	const mounted: Mounted = {
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
	if (!markers || !markers.start.data.startsWith('exact:component:')) return false;
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
		mode: 'hydrated'
	};
	root.boundary = createRootBoundary(root);
	const scope = createEffectScope();
	const mounted: Mounted = { vnode, dom: markers.start, end: markers.end, scope, children: [] };
	try {
		return withDomWork(root, () => {
			countDomWork(root);
			const instance = withEffectScope(scope, () =>
				createComponentInstance(
					vnode.type as ComponentFunction<any, Record<string, unknown>>,
					getComponentProps(vnode),
					undefined,
					undefined,
					vnode.domain
				)
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
		mode: 'hydrated',
		markerlessHydration: true
	};
	root.boundary = createRootBoundary(root);
	const scope = createEffectScope();
	const mounted: Mounted = { vnode, dom: start, end, scope, children: [] };
	try {
		return withDomWork(root, () => {
			countDomWork(root);
			const instance = withEffectScope(scope, () =>
				createComponentInstance(
					vnode.type as ComponentFunction<any, Record<string, unknown>>,
					getComponentProps(vnode),
					undefined,
					undefined,
					vnode.domain
				)
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
		mode: 'document',
		markerlessHydration: true
	};
	root.boundary = createRootBoundary(root);
	const scope = createEffectScope();
	const boundaryVNode = createVNode(root.boundary, { version: root.version });
	const mounted: Mounted = { vnode: boundaryVNode, dom: start, end, scope, children: [] };
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
