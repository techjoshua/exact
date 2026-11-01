import { reconcileSelectChildren } from '../controlled-select.js';
import {
	attemptCleanup,
	attachSuppressedCleanupFailure,
	createCleanupFailure,
	recordCleanupFailure,
	throwCleanupFailure,
	type RefBinding
} from '@exactjs/core';
import { clearElementOwner, clearNodeOwner } from '../ownership.js';
import { clearElementProps } from '../props.js';
import { componentMounts, roots } from '../state.js';
import { releaseReplacedProgramProps } from '../compiled-props.js';
import type { Mounted, Root } from '../types.js';
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
 * Rolls back provisional children in reverse ownership order.
 *
 * Detached roots use a temporary parent only as the traversal origin; portal
 * descendants still remove themselves from their actual portal targets.
 */
export function rollbackMountedChildren(
	mounted: readonly Mounted[],
	parent: Node | undefined,
	primary: unknown
): void {
	for (let index = mounted.length - 1; index >= 0; index--) {
		const child = mounted[index]!;
		const removalParent = parent ?? child.dom.parentNode ?? document.createDocumentFragment();
		try {
			disposeMounted(removalParent, child);
		} catch (cleanup) {
			attachSuppressedCleanupFailure(primary, cleanup);
		}
	}
}

/**
 * Stops scopes on entry, then releases descendants before their parent in sibling order.
 * Cleanup failures are accumulated so later owned resources still receive teardown.
 */
export function unmountMounted(mounted: Mounted): void {
	unmountOwnedRange(mounted);
}

/** Releases one logical range, retaining actual successor ranges and hosts only during adoption rollback. */
function unmountOwnedRange(
	mounted: Mounted,
	successor?: ReturnType<typeof adoptionSuccessor>
): void {
	// An undefined marker completes the preceding mount after its children.
	const pending: Array<Mounted | undefined> = [mounted];
	const failure = teardownFailure();
	while (pending.length) {
		const entering = pending.pop();
		if (entering) {
			if (successor?.range(entering)) continue;
			const suspension = entering.suspensionRegistration;
			entering.suspensionRegistration = undefined;
			if (suspension) attemptTeardown(failure, () => suspension.cancel());
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
		if (successor?.range(current)) continue;
		if (current.instance) {
			if (componentMounts.get(current.instance) === current)
				componentMounts.delete(current.instance);
			attemptTeardown(failure, () => {
				const artifact = current.clientArtifact;
				if (artifact) artifact.dispose(current.instance!, 'dom-unmount');
				else current.instance!.unmount();
			});
			attemptTeardown(failure, () => disposeMountedComponentRoot(current.instance!));
		}
		if (current.targetBoundary?.release) attemptTeardown(failure, current.targetBoundary.release);
		if (successor && current.renderProgram)
			attemptTeardown(failure, () =>
				releaseReplacedProgramProps(current, successor.node, successor.ref)
			);
		if (current.stop) attemptTeardown(failure, current.stop);
		if (current.dom instanceof Element) {
			attemptTeardown(failure, () => clearTargetedIntrinsicProps(current));
			if (!successor?.node(current.dom)) {
				attemptTeardown(failure, () => clearElementProps(current.dom as Element));
				if (!successor?.node(current.dom))
					attemptTeardown(failure, () => clearElementOwner(current.dom as Element));
			}
		}
		if (!successor?.node(current.dom)) attemptTeardown(failure, () => clearNodeOwner(current.dom));
		if (current.end && !successor?.node(current.end))
			attemptTeardown(failure, () => clearNodeOwner(current.end!));
		const ref = current.intrinsicReceipt?.props.ref as RefBinding<unknown> | undefined;
		if (ref && typeof ref.fulfill === 'function' && !successor?.ref(current.dom, ref))
			attemptTeardown(failure, () => ref.fulfill(undefined));
	}
	throwTeardownFailure(failure);
}

/**
 * Releases only endpoint nodes captured at their creation by a markerless adopter.
 * A retiring root is not its own successor. A distinct registered successor may retain exact
 * nodes or the whole Mounted range, independently of the retired scope's active state.
 */
export function releaseCreatedAdoptionEndpoints(
	root: Root,
	mounted: Mounted,
	start: Text,
	end: Text | undefined
): void {
	let successor: ReturnType<typeof adoptionSuccessor> | undefined;
	const failure = teardownFailure();
	for (const node of [start, end]) {
		if (!node) continue;
		attemptTeardown(failure, () => {
			const current = roots.get(root.container);
			if (current && current !== root) {
				successor ??= adoptionSuccessor(root);
				if (successor.range(mounted) || successor.node(node)) return;
			}
			node.parentNode?.removeChild(node);
		});
	}
	throwTeardownFailure(failure);
}

/** Releases mounted nodes and its owned resources. */
export function removeMountedNodes(parent: Node, mounted: Mounted): void {
	const pending: Array<{ mounted: Mounted; parent: Node; complete: boolean }> = [
		{ mounted, parent, complete: false }
	];
	const failure = teardownFailure();
	let changed = false;
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
			attemptTeardown(failure, () => {
				current.parent.removeChild(current.mounted.dom);
				if (current.parent === parent) changed = true;
			});
		for (const node of current.mounted.rawNodes ?? []) {
			if (node.parentNode === current.parent)
				attemptTeardown(failure, () => {
					current.parent.removeChild(node);
					if (current.parent === parent) changed = true;
				});
		}
		if (current.mounted.end?.parentNode === current.parent)
			attemptTeardown(failure, () => {
				current.parent.removeChild(current.mounted.end!);
				if (current.parent === parent) changed = true;
			});
	}
	throwTeardownFailure(failure);
	if (changed) reconcileSelectChildren(undefined, parent);
}

/**
 * Releases only locally acquired adoption ranges. The explicit old root owns physical removal.
 * Cleanup failures supplement the original rejection or supersession signal without replacing it.
 */
export function releaseUnpublishedAdoption(
	root: Root,
	mounts: readonly Mounted[],
	primary: unknown
): void {
	const successor = adoptionSuccessor(root);
	for (let index = mounts.length - 1; index >= 0; index--) {
		try {
			unmountOwnedRange(mounts[index]!, successor);
		} catch (cleanup) {
			attachSuppressedCleanupFailure(primary, cleanup);
		}
	}
}

/**
 * Snapshots only the actual registered successor during rare failed acquisition cleanup.
 * Authored cleanup may reenter, so each query refreshes after its root/attempt/version changes.
 */
function adoptionSuccessor(receiving: Root) {
	let selected: Root | undefined;
	let mounted: Mounted | undefined;
	let attempt: Root['componentInputAttempt'];
	let version: number | undefined;
	const ranges = new Set<Mounted>();
	const nodes = new Set<Node>();
	const refs = new Map<Node, Set<unknown>>();
	const refresh = () => {
		const current = roots.get(receiving.container);
		if (
			current === selected &&
			current?.mounted === mounted &&
			current?.componentInputAttempt === attempt &&
			current?.version === version
		)
			return;
		selected = current;
		mounted = current?.mounted;
		attempt = current?.componentInputAttempt;
		version = current?.version;
		ranges.clear();
		nodes.clear();
		refs.clear();
		const retainRef = (node: Node, ref: unknown) => {
			if (!ref) return;
			let values = refs.get(node);
			if (!values) refs.set(node, (values = new Set()));
			values.add(ref);
		};
		const pending = mounted ? [mounted] : [];
		while (pending.length) {
			const next = pending.pop()!;
			if (ranges.has(next)) continue;
			ranges.add(next);
			nodes.add(next.dom);
			if (next.end) nodes.add(next.end);
			for (const node of next.rawNodes ?? []) nodes.add(node);
			retainRef(next.dom, next.intrinsicReceipt?.props.ref);
			const state = next.renderProgram;
			if (state) {
				nodes.add(state.programRoot);
				for (const node of state.slotNodes) if (node instanceof Node) nodes.add(node);
				for (const [element, props] of state.props ?? []) retainRef(element, props.ref);
				for (const props of state.compiledProps ?? [])
					if (props) retainRef(props.element, props.values.ref);
			}
			for (const child of next.children) pending.push(child);
			for (const child of next.suspense?.candidate?.children ?? []) pending.push(child);
		}
	};
	return {
		range(value: Mounted) {
			refresh();
			return ranges.has(value);
		},
		node(value: Node) {
			refresh();
			return nodes.has(value);
		},
		ref(node: Node, value: unknown) {
			refresh();
			return refs.get(node)?.has(value) ?? false;
		}
	};
}
