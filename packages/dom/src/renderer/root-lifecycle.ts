import { createVNode, Text, type ComponentInstance, type VNode } from '@exactjs/core';
import { flushSync } from '@exactjs/reactive';
import { clearDelegated } from '../events.js';
import { componentMounts, roots } from '../state.js';
import type { DomProfileEvent, Mounted, RenderOptions } from '../types.js';
import { walkDomSubtree, type DomWorkBudget } from '../work.js';
import { normalizeTreeDepth, normalizeTreeNodes, withDomWork } from './limits.js';
import { patch } from './patching/root.js';
import { createDomErrorContext, createRootBoundary } from './root-support.js';
import {
	attemptTeardown,
	recordTeardownFailure,
	removeMountedNodes,
	teardownFailure,
	throwTeardownFailure,
	unmountMounted
} from './teardown.js';

/** Resolves a component dom node. */
export function findComponentDomNode(instance: ComponentInstance<any>): Node | null {
	const mounted = componentMounts.get(instance);
	return mounted ? firstHostNode(mounted) : null;
}

/** Performs the first host node domain operation. */
export function firstHostNode(mounted: Mounted): Node | null {
	if (typeof mounted.vnode.type === 'string' && mounted.dom instanceof Element) return mounted.dom;
	if (
		mounted.vnode.type === Text &&
		mounted.dom.nodeType === Node.TEXT_NODE &&
		mounted.dom.textContent !== ''
	)
		return mounted.dom;
	for (const child of mounted.children) {
		const node = firstHostNode(child);
		if (node) return node;
	}
	return null;
}

/** Transfers a mounted component instance to the root so teardown releases it exactly once. */
export function ownMountedInstance(mounted: Mounted, instance: ComponentInstance<any>): void {
	mounted.instance = instance;
	componentMounts.set(instance, mounted);
}

/** Transforms render into its required representation. */
export function render(vnode: VNode, container: Element, options: RenderOptions = {}): void {
	let root = roots.get(container);
	if (root?.current.domain && !vnode.domain) {
		// A hydrated root keeps owning later authored updates even when callers
		// create the replacement VNode outside withComponentDomain(). Explicit
		// domains still win for deliberate cross-root composition.
		vnode = { ...vnode, domain: root.current.domain };
	}
	if (!root) {
		root = {
			container,
			delegated: new Map(),
			errors: createDomErrorContext(options),
			portalTargets: new Set(),
			current: vnode,
			version: 0,
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
			onProfile: options.onProfile
		};
		root.boundary = createRootBoundary(root);
		roots.set(container, root);
	}
	root.current = vnode;
	root.version++;
	root.logger = options.logger;
	root.debugMarkers = options.debugMarkers ?? false;
	root.maxTreeDepth = normalizeTreeDepth(options.maxTreeDepth);
	root.maxTreeNodes = normalizeTreeNodes(options.maxTreeNodes);
	root.workBudget = options.workBudget;
	root.allowUnsafeHtml = options.allowUnsafeHtml ?? root.allowUnsafeHtml;
	root.onUnsafeHtml = options.onUnsafeHtml ?? root.onUnsafeHtml;
	root.onProfile = options.onProfile ?? root.onProfile;

	const next =
		root.mode === 'hydrated' ? vnode : createVNode(root.boundary, { version: root.version });
	const profileStarted = root.onProfile ? performance.now() : undefined;
	try {
		withDomWork(root, () => {
			root.mounted = patch(
				root,
				container,
				root.mounted,
				next,
				options.logicalParent,
				options.logicalParent?.scope
			);
			flushSync();
		});
	} finally {
		if (profileStarted !== undefined) {
			root.onProfile?.(
				Object.freeze({
					subsystem: 'dom',
					phase: 'render',
					elapsedMs: performance.now() - profileStarted,
					counts: Object.freeze({
						version: root.version,
						traversedNodes: root.traversedNodes
					})
				} satisfies DomProfileEvent)
			);
		}
		root.workBudget = undefined;
	}
}

/** Unmounts a root, releasing component ownership before removing its remaining DOM nodes. */
export function unmount(container: Element): boolean {
	return dispose(container, true);
}

/** Releases dispose and its owned resources. */
export function dispose(container: Element, removeDom = false): boolean {
	const root = roots.get(container);
	if (!root) return false;

	// Delete first so lifecycle callbacks may safely render a fresh root into the
	// same container without the old root later deleting the replacement.
	roots.delete(container);
	const failure = teardownFailure();
	attemptTeardown(failure, () => clearDelegated(root));

	const mounted = root.mounted;
	root.mounted = undefined;
	if (mounted) {
		attemptTeardown(failure, () => unmountMounted(mounted));
		if (removeDom) attemptTeardown(failure, () => removeMountedNodes(container, mounted));
	}
	throwTeardownFailure(failure);
	return true;
}

/** Releases owned subtree and its owned resources. */
export function disposeOwnedSubtree(
	container: Element,
	includeSelf = true,
	work?: number | DomWorkBudget
): number {
	const candidates: Element[] = [];
	walkDomSubtree(
		container,
		(node) => {
			if (node instanceof Element && (includeSelf || node !== container)) candidates.push(node);
		},
		typeof work === 'number' ? { maxNodes: work } : { budget: work }
	);
	let disposed = 0;
	const failure = teardownFailure();
	for (let index = candidates.length - 1; index >= 0; index--) {
		try {
			if (dispose(candidates[index]!, false)) disposed++;
		} catch (error) {
			recordTeardownFailure(failure, error);
		}
	}
	throwTeardownFailure(failure);
	return disposed;
}
