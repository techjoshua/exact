import {
	attemptCleanup,
	createCleanupFailure,
	recordCleanupFailure,
	throwCleanupFailure,
	type RefBinding
} from '@exact/core';
import { clearElementOwner } from '../ownership.js';
import { clearElementProps } from '../props.js';
import { componentMounts } from '../state.js';
import type { Mounted } from '../types.js';

/** Provides the canonical teardown failure value. */
export const teardownFailure = createCleanupFailure;

/** Provides the canonical record teardown failure value. */
export const recordTeardownFailure = recordCleanupFailure;

/** Provides the canonical attempt teardown value. */
export const attemptTeardown = attemptCleanup;

/** Provides the canonical throw teardown failure value. */
export const throwTeardownFailure = throwCleanupFailure;

/** Performs the unmount many domain operation. */
export function unmountMany(mounts: readonly Mounted[]): void {
	const failure = teardownFailure();
	for (const mounted of mounts) attemptTeardown(failure, () => unmountMounted(mounted));
	throwTeardownFailure(failure);
}

/** Releases mounted and its owned resources. */
export function disposeMounted(parent: Node, mounted: Mounted): void {
	const failure = teardownFailure();
	attemptTeardown(failure, () => unmountMounted(mounted));
	attemptTeardown(failure, () => removeMountedNodes(parent, mounted));
	throwTeardownFailure(failure);
}

/** Performs the unmount mounted domain operation. */
export function unmountMounted(mounted: Mounted): void {
	const pending: Array<{ mounted: Mounted; complete: boolean }> = [{ mounted, complete: false }];
	const failure = teardownFailure();
	while (pending.length) {
		const current = pending.pop()!;
		if (!current.complete) {
			attemptTeardown(failure, () => current.mounted.scope.stop());
			pending.push({ mounted: current.mounted, complete: true });
			for (let index = current.mounted.children.length - 1; index >= 0; index--) {
				pending.push({ mounted: current.mounted.children[index]!, complete: false });
			}
			continue;
		}
		if (current.mounted.instance) {
			componentMounts.delete(current.mounted.instance);
			attemptTeardown(failure, () => current.mounted.instance!.unmount());
		}
		if (current.mounted.stop) attemptTeardown(failure, current.mounted.stop);
		if (current.mounted.dom instanceof Element) {
			attemptTeardown(failure, () => clearElementProps(current.mounted.dom as Element));
			attemptTeardown(failure, () => clearElementOwner(current.mounted.dom as Element));
		}
		const ref = current.mounted.vnode.props.ref as RefBinding<unknown> | undefined;
		if (ref) attemptTeardown(failure, () => ref.fulfill(undefined));
	}
	throwTeardownFailure(failure);
}

/** Releases mounted nodes and its owned resources. */
export function removeMountedNodes(parent: Node, mounted: Mounted): void {
	const pending: Array<{ mounted: Mounted; parent: Node; complete: boolean }> = [
		{ mounted, parent, complete: false }
	];
	const failure = teardownFailure();
	while (pending.length) {
		const current = pending.pop()!;
		if (!current.complete) {
			pending.push({ ...current, complete: true });
			const childParent = current.mounted.portalTarget ?? current.parent;
			for (let index = current.mounted.children.length - 1; index >= 0; index--) {
				pending.push({
					mounted: current.mounted.children[index]!,
					parent: childParent,
					complete: false
				});
			}
			continue;
		}
		if (current.mounted.dom.parentNode === current.parent)
			attemptTeardown(failure, () => current.parent.removeChild(current.mounted.dom));
		for (const node of current.mounted.rawNodes ?? []) {
			if (node.parentNode === current.parent)
				attemptTeardown(failure, () => current.parent.removeChild(node));
		}
		if (current.mounted.end?.parentNode === current.parent)
			attemptTeardown(failure, () => current.parent.removeChild(current.mounted.end!));
	}
	throwTeardownFailure(failure);
}
