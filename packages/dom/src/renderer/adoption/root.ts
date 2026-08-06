import {
	createComponentInstance,
	createVNode,
	renderInstance,
	type ComponentInstance,
	type VNode
} from '@exactjs/core';
import { createEffectScope, withEffectScope } from '@exactjs/reactive';
import { clearDelegated } from '../../events.js';
import { roots } from '../../state.js';
import type { Mounted, RenderOptions, Root } from '../../types.js';
import { countDomWork, isDomRenderLimitError, withDomWork } from '../limits.js';
import { rerenderComponent } from '../patching/children.js';
import { refreshComponentRoot, rootIntroduction } from '../component-roots.js';
import { activateEnhancementSubtree, installEnhancementReconciliation } from '../enhancements.js';
import { mount } from '../mounting/root.js';
import { createRendererRoot } from '../root-construction.js';
import { ownMountedInstance } from '../root-lifecycle.js';
import { unmountMounted } from '../teardown.js';
import { adoptStaticChildren, boundaryMarkers, contentNodesBetween } from './boundaries.js';
import { constructAdoptedComponent } from './construction.js';
import { componentMarkerMatchesType } from './identity.js';

/** Performs the adopt static domain operation. */
export function adoptStatic(
	vnode: VNode,
	container: Element,
	options: RenderOptions = {}
): boolean {
	if (roots.has(container)) return true;
	const markers = boundaryMarkers(container);
	if (!markers) return false;
	const root = createRendererRoot(container, vnode, options, { version: 1 });
	const scope = createEffectScope();
	const mounted: Mounted = {
		vnode: createVNode(root.boundary, { version: root.version }),
		dom: markers.start,
		end: markers.end,
		scope,
		children: []
	};
	return completeRootAdoption(root, mounted, contentNodesBetween(markers.start, markers.end), () =>
		createComponentInstance(root.boundary, { version: root.version })
	);
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
	const root = createRendererRoot(container, vnode, options, { version: 1, mode: 'hydrated' });
	const scope = createEffectScope();
	const mounted: Mounted = { vnode, dom: markers.start, end: markers.end, scope, children: [] };
	return completeRootAdoption(root, mounted, contentNodesBetween(markers.start, markers.end), () =>
		constructAdoptedComponent(vnode, options.logicalParent)
	);
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
	const root = createRendererRoot(container, vnode, options, {
		version: 1,
		mode: 'hydrated',
		markerlessHydration: true
	});
	const scope = createEffectScope();
	const mounted: Mounted = { vnode, dom: start, end, scope, children: [] };
	try {
		return completeRootAdoption(root, mounted, contentNodesBetween(start, end), () =>
			constructAdoptedComponent(vnode, options.logicalParent)
		);
	} finally {
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
	const root = createRendererRoot(container, vnode, options, {
		version: 1,
		mode: 'document',
		markerlessHydration: true
	});
	const scope = createEffectScope();
	const mounted: Mounted = {
		vnode: createVNode(root.boundary, { version: root.version }),
		dom: start,
		end,
		scope,
		children: []
	};
	try {
		return completeRootAdoption(root, mounted, [container], () =>
			createComponentInstance(root.boundary, { version: root.version })
		);
	} finally {
		if (!roots.has(container)) {
			start.remove();
			end.remove();
		}
	}
}

function completeRootAdoption(
	root: Root,
	mounted: Mounted,
	nodes: readonly Node[],
	construct: () => ComponentInstance<any>
): boolean {
	let current = mounted;
	try {
		return withDomWork(root, () => {
			countDomWork(root);
			const instance = withEffectScope(current.scope, construct);
			ownMountedInstance(current, instance);
			const rendered = withEffectScope(current.scope, () =>
				renderInstance(instance, () => rerenderComponent(root, current))
			);
			const children = adoptStaticChildren(root, rendered, nodes, instance, current.scope);
			if (!children) return false;
			current.children = children;
			current = activateAdoptedEnhancements(root, current);
			refreshComponentRoot(instance, true, rootIntroduction(root));
			instance.markMounted();
			root.mounted = current;
			root.initialCommitComplete = true;
			roots.set(root.container, root);
			return true;
		});
	} catch (error) {
		if (isDomRenderLimitError(error)) throw error;
		return false;
	} finally {
		if (!roots.has(root.container)) {
			unmountMounted(current);
			clearDelegated(root);
		}
		root.workBudget = undefined;
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
