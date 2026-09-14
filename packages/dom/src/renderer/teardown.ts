import {
	attemptCleanup,
	createCleanupFailure,
	recordCleanupFailure,
	throwCleanupFailure,
	type RefBinding
} from '@exactjs/core';
import { clearElementOwner, clearNodeOwner } from '../ownership.js';
import { clearElementProps } from '../props.js';
import { componentMounts } from '../state.js';
import type { Mounted } from '../types.js';
import { disposeMountedComponentRoot } from './component-roots.js';
import { clearTargetedIntrinsicProps } from './target-capability.js';

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

/**
 * Stops scopes on entry, then releases descendants before their parent in sibling order.
 * Cleanup failures are accumulated so later owned resources still receive teardown.
 */
export function unmountMounted(mounted: Mounted): void {
	// An undefined marker completes the preceding mount after its children.
	const pending: Array<Mounted | undefined> = [mounted];
	const failure = teardownFailure();
	while (pending.length) {
		const entering = pending.pop();
		if (entering) {
			entering.suspensionRegistration?.cancel();
			entering.suspensionRegistration = undefined;
			attemptTeardown(failure, () => entering.scope.stop());
			pending.push(entering, undefined);
			for (
				let index = (entering.suspense?.candidate?.children.length ?? 0) - 1;
				index >= 0;
				index--
			) {
				pending.push(entering.suspense!.candidate!.children[index]!);
			}
			for (let index = entering.children.length - 1; index >= 0; index--) {
				pending.push(entering.children[index]!);
			}
			continue;
		}
		const current = pending.pop()!;
		if (current.instance) {
			componentMounts.delete(current.instance);
			attemptTeardown(failure, () => {
				const artifact = current.clientArtifact;
				if (artifact) artifact.dispose(current.instance!, 'dom-unmount');
				else current.instance!.unmount();
			});
			attemptTeardown(failure, () => disposeMountedComponentRoot(current.instance!));
		}
		if (current.targetBoundary?.release) attemptTeardown(failure, current.targetBoundary.release);
		if (current.stop) attemptTeardown(failure, current.stop);
		if (current.dom instanceof Element) {
			attemptTeardown(failure, () => clearTargetedIntrinsicProps(current));
			attemptTeardown(failure, () => clearElementProps(current.dom as Element));
			attemptTeardown(failure, () => clearElementOwner(current.dom as Element));
		}
		attemptTeardown(failure, () => clearNodeOwner(current.dom));
		if (current.end) attemptTeardown(failure, () => clearNodeOwner(current.end!));
		const ref = current.intrinsicReceipt?.props.ref as RefBinding<unknown> | undefined;
		if (ref && typeof ref.fulfill === 'function')
			attemptTeardown(failure, () => ref.fulfill(undefined));
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
