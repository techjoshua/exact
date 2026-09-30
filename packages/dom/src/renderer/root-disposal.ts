import { clearDelegated } from '../events.js';
import { roots, unregisterInspectableRoot } from '../state.js';
import { walkDomSubtree, type DomWorkBudget } from '../work.js';
import { disposeRetainedReleases } from './retained-release.js';
import {
	attemptTeardown,
	recordTeardownFailure,
	removeMountedNodes,
	teardownFailure,
	throwTeardownFailure,
	unmountMounted
} from './teardown.js';

/**
 * Releases the root registered for this exact container and removes its owned DOM range.
 * Keeps the container itself. Returns `false` when no root is registered.
 * Cleanup failures are reported after the remaining teardown steps have been attempted.
 */
export function unmount(container: Element): boolean {
	return dispose(container, true);
}

/**
 * Stops a root's reactive work and releases its components and event handlers.
 * By default, leaves its DOM in place as inactive markup. Set `removeDom` to remove the owned
 * range as well. Returns `false` when this exact container has no registered root.
 * Cleanup failures are reported after the remaining teardown steps have been attempted.
 */
export function dispose(container: Element, removeDom = false): boolean {
	const root = roots.get(container);
	if (!root) return false;

	// Delete first so lifecycle callbacks may safely mount a replacement into this container.
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

/**
 * Disposes registered roots within a DOM subtree, leaving their markup in place.
 * Includes the container by default and visits descendant roots before ancestor roots.
 * Returns the number of roots disposed. Traversal limits and cleanup failures can throw.
 */
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
