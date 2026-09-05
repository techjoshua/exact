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

/** Unmounts a renderer root and removes its owned DOM range. */
export function unmount(container: Element): boolean {
	return dispose(container, true);
}

/** Releases a renderer root and optionally removes its owned DOM range. */
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

/** Releases renderer roots owned by a bounded DOM subtree. */
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
