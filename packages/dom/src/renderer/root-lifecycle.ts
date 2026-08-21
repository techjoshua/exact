import {
	type AnyComponentInstance,
	createVNode,
	LoggerContext,
	Text,
	type VNode
} from '@exactjs/core';
import {
	componentDomainInspection,
	createFrameworkComponentDomain
} from '@exactjs/core/framework/component-domains';
import { flushSync } from '@exactjs/reactive';
import { clearDelegated } from '../events.js';
import {
	componentMounts,
	exactDomInspectionOwner,
	registerInspectableRoot,
	roots,
	unregisterInspectableRoot
} from '../state.js';
import type { DomProfileEvent, Mounted, RenderOptions } from '../types.js';
import { walkDomSubtree, type DomWorkBudget } from '../work.js';
import { normalizeTreeDepth, normalizeTreeNodes, withDomWork } from './limits.js';
import { patch } from './patching/root.js';
import { createRendererRoot } from './root-construction.js';
import {
	attemptTeardown,
	recordTeardownFailure,
	removeMountedNodes,
	teardownFailure,
	throwTeardownFailure,
	unmountMounted
} from './teardown.js';
import { disposeRetainedReleases } from './retained-release.js';
import { publishExactProfile } from '@exactjs/instrumentation';

/** Resolves a component dom node. */
export function findComponentDomNode(instance: AnyComponentInstance): Node | null {
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
export function ownMountedInstance(mounted: Mounted, instance: AnyComponentInstance): void {
	mounted.instance = instance;
	componentMounts.set(instance, mounted);
}

/** Transforms render into its required representation. */
export function render(vnode: VNode, container: Element, options: RenderOptions = {}): void {
	let root = roots.get(container);
	const inspection = options.inspection ?? exactDomInspectionOwner();
	if (root?.current.domain && !vnode.domain) {
		// A hydrated or inspected root keeps owning later authored updates even when callers create
		// the replacement VNode outside withComponentDomain(). Explicit domains still win.
		vnode = { ...vnode, domain: root.current.domain };
	} else if (inspection && !vnode.domain) {
		vnode = {
			...vnode,
			domain: createFrameworkComponentDomain({
				executionRoot: inspection.executionRoot,
				inspection
			})
		};
	}
	if (!root) {
		root = createRendererRoot(container, vnode, options, { version: 0 });
		roots.set(container, root);
		if (vnode.domain && componentDomainInspection(vnode.domain)) registerInspectableRoot(root);
	}
	if (root.errors.errors.length) root.errors.clearAll();
	const previousCurrent = root.current;
	const previousVersion = root.version;
	root.current = vnode;
	if (vnode.domain && componentDomainInspection(vnode.domain)) registerInspectableRoot(root);
	root.version++;
	root.logger = options.logger;
	if (options.logger) {
		const contexts = root.ambientContexts as Map<symbol, unknown> | undefined;
		if (contexts) contexts.set(LoggerContext.id, options.logger);
		else root.ambientContexts = new Map([[LoggerContext.id, options.logger]]);
	} else {
		(root.ambientContexts as Map<symbol, unknown> | undefined)?.delete(LoggerContext.id);
	}
	root.debugMarkers = options.debugMarkers ?? false;
	root.maxTreeDepth = normalizeTreeDepth(options.maxTreeDepth);
	root.maxTreeNodes = normalizeTreeNodes(options.maxTreeNodes);
	root.workBudget = options.workBudget;
	root.allowUnsafeHtml = options.allowUnsafeHtml ?? root.allowUnsafeHtml;
	root.onUnsafeHtml = options.onUnsafeHtml ?? root.onUnsafeHtml;
	root.onProfile = options.onProfile ?? root.onProfile;
	root.enhancementCatalog = options.enhancementCatalog ?? root.enhancementCatalog;

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
		if (!root.errors.errors.length) root.patchRecoveryRequired = false;
		root.initialCommitComplete = true;
	} catch (error) {
		// A patch may mutate DOM before a later child/prop operation fails. Roll the public root
		// identity back and force the next attempt through every exact-VNode fast path so the
		// partially advanced mounted metadata cannot make an identical retry a no-op.
		root.current = previousCurrent;
		root.version = previousVersion;
		root.patchRecoveryRequired = true;
		throw error;
	} finally {
		if (profileStarted !== undefined) {
			publishExactProfile(
				root.onProfile,
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
	unregisterInspectableRoot(root);
	const failure = teardownFailure();
	attemptTeardown(failure, () => clearDelegated(root));
	attemptTeardown(failure, () => disposeRetainedReleases(root));

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
