import { type AnyComponentInstance, type Child } from '@exactjs/core';
import { type EffectScope } from '@exactjs/reactive/framework/runtime';
import { describeNode, domDebug } from '../../debug.js';
import { preserveFocus } from '../../focus.js';
import { placeMountedBefore } from '../../placement.js';
import type { Mounted, Root } from '../../types.js';
import { withDomWork } from '../limits.js';
import { longestIncreasingSubsequencePositions } from '../reconciliation.js';
import {
	attemptTeardown,
	disposeMounted,
	removeMountedNodes,
	teardownFailure,
	throwTeardownFailure,
	unmountMounted
} from '../teardown.js';
import { releaseMountedRange } from '../retained-release.js';
import { takeReversedRelease } from '../retained-release.js';
import { mountDetachedChildren, mountDetachedOperation } from '../mounting/children.js';
import { requireDomEnhancementCapability } from '../enhancement-capability.js';
import {
	mixedChildOperations,
	mountedChildKey,
	type MixedChildOperation
} from './mixed-child-operations.js';
import { completeChildReconciliation } from './reconciliation-completion.js';
import { bindText } from './text-binding.js';
import { canPatchOpaqueOperation, patchOpaqueOperation } from './native-operation-target.js';
import { createForeignReplacementParking } from './replacement-parking.js';

export { bindText } from './text-binding.js';

/** Performs the patch children domain operation. */
export function patchChildren(
	root: Root,
	parent: Node,
	oldChildren: Mounted[],
	nextChildren: Child[],
	parentInstance?: AnyComponentInstance,
	parentScope?: EffectScope,
	before?: Node | null,
	structuralOwner?: Mounted
): Mounted[] {
	if (root.interactionWork) root.interactionWork.reconciliations++;
	domDebug(root, 'patch children', () => ({
		parent: describeNode(parent),
		oldCount: oldChildren.length,
		nextCount: nextChildren.length,
		before: describeNode(before)
	}));
	// DOM writes for form controls can disturb the active element; patch inside the
	// focus-preservation helper so reorders and reactive updates stay ergonomic.
	return withDomWork(root, () =>
		preserveFocus(root, () => {
			const operations = mixedChildOperations(nextChildren);
			return patchMixedNativeChildren(
				root,
				parent,
				oldChildren,
				operations,
				parentInstance,
				parentScope,
				before,
				structuralOwner
			);
		})
	);
}

/** Reconciles scalar, explicit foreign, and native-operation siblings without conversion. */
function patchMixedNativeChildren(
	root: Root,
	parent: Node,
	oldChildren: Mounted[],
	next: readonly MixedChildOperation[],
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope | undefined,
	before: Node | null | undefined,
	structuralOwner: Mounted | undefined
): Mounted[] {
	const oldKeys = new Map<string, { mounted: Mounted; index: number }>();
	const oldUnkeyed: Array<{ mounted: Mounted; index: number }> = [];
	for (let index = 0; index < oldChildren.length; index++) {
		const mounted = oldChildren[index]!;
		const key = mountedChildKey(mounted);
		if (key === undefined) oldUnkeyed.push({ mounted, index });
		else {
			if (oldKeys.has(key)) throw new Error(`Duplicate key "${key}" in mounted children`);
			oldKeys.set(key, { mounted, index });
		}
	}
	const seenKeys = new Set<string>();
	const matches = new Array<{ mounted: Mounted; index: number } | undefined>(next.length);
	let unkeyedIndex = 0;
	for (let index = 0; index < next.length; index++) {
		const operation = next[index]!;
		if (operation.key === undefined) matches[index] = oldUnkeyed[unkeyedIndex++];
		else {
			if (seenKeys.has(operation.key))
				throw new Error(`Duplicate key "${operation.key}" in rendered children`);
			seenKeys.add(operation.key);
			matches[index] = oldKeys.get(operation.key);
		}
	}
	const matched = new Set(matches.flatMap((entry) => (entry ? [entry.mounted] : [])));
	const oldOrder = matches.map((entry) => entry?.index ?? -1);
	const stable = longestIncreasingSubsequencePositions(oldOrder);
	const mounted = new Array<Mounted>(next.length);
	let cursor = before ?? null;
	for (let index = next.length - 1; index >= 0; index--) {
		const operation = next[index]!;
		const previous = matches[index];
		const current = operation.native
			? previous
				? Object.is(previous.mounted.operation, operation.value)
					? previous.mounted
					: patchCompilerChildReceipt(
							root,
							parent,
							previous.mounted,
							operation.value,
							parentInstance,
							parentScope,
							undefined
						)
				: (() => {
						const reversed = takeReversedRelease(root, parent, operation.value);
						return reversed
							? patchCompilerChildReceipt(
									root,
									parent,
									reversed,
									operation.value,
									parentInstance,
									parentScope,
									undefined
								)
							: mountDetachedChildren(
									root,
									[operation.value],
									parentInstance,
									parentScope,
									parent
								)[0]!;
					})()
			: operation.scalar !== undefined
				? patchScalarChild(
						root,
						parent,
						previous?.mounted,
						operation.value,
						operation.scalar,
						parentInstance,
						parentScope
					)
				: (() => {
						throw new TypeError('Unsupported native child operation');
					})();
		mounted[index] = current;
		if (!previous || !stable.has(index)) placeMountedBefore(root, parent, current, cursor);
		cursor = current.dom;
	}
	const teardown = teardownFailure();
	for (const old of oldChildren) {
		if (matched.has(old)) continue;
		if (!releaseMountedRange(root, parent, old, 'reconcile-removed')) {
			attemptTeardown(teardown, () => unmountMounted(old));
			attemptTeardown(teardown, () => removeMountedNodes(parent, old));
		}
	}
	throwTeardownFailure(teardown);
	completeChildReconciliation(root, parentInstance, structuralOwner);
	return mounted;
}

/** Patches one compiler-issued operation without normalizing it into renderer topology. */
function patchCompilerChildReceipt(
	root: Root,
	parent: Node,
	oldChild: Mounted,
	next: Child,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope | undefined,
	structuralOwner: Mounted | undefined
): Mounted {
	if (oldChild.enhancement && canPatchOpaqueOperation(oldChild.enhancement.target, next))
		return requireDomEnhancementCapability().patch(
			root,
			oldChild,
			next,
			parent,
			parentInstance,
			parentScope,
			(current, value, instance, scope) =>
				current
					? patchCompilerChildReceipt(
							root,
							parent,
							current,
							value,
							instance,
							scope,
							structuralOwner
						)
					: mountDetachedOperation(root, value, instance, scope, parent)
		);
	const patched = patchOpaqueOperation(
		root,
		parent,
		oldChild,
		next,
		parentInstance,
		parentScope,
		structuralOwner
	);
	if (patched) {
		completeChildReconciliation(root, parentInstance, structuralOwner);
		return patched;
	}
	const previousParking = root.replacementParking;
	const parking = createForeignReplacementParking(oldChild, parent);
	root.replacementParking = parking;
	let replacement: Mounted | undefined;
	try {
		replacement = mountDetachedChildren(root, [next], parentInstance, parentScope, parent)[0];
	} finally {
		root.replacementParking = previousParking;
	}
	if (!replacement) throw new Error('Compiler-issued child operation did not mount a range');
	for (const commit of parking.commits) commit();
	placeMountedBefore(root, parent, replacement, oldChild.dom);
	if (!releaseMountedRange(root, parent, oldChild, 'reconcile-replaced')) {
		unmountMounted(oldChild);
		removeMountedNodes(parent, oldChild);
	}
	for (const remaining of parking.mounts.values())
		for (const parked of remaining) disposeMounted(parked.parent, parked.mounted);
	completeChildReconciliation(root, parentInstance, structuralOwner);
	return replacement;
}

/** Updates native scalar text or replaces a differently owned range as one operation. */
function patchScalarChild(
	root: Root,
	parent: Node,
	mounted: Mounted | undefined,
	value: Child,
	scalar: string,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope | undefined
): Mounted {
	if (mounted?.scalar && mounted.dom.nodeType === 3) {
		if (mounted.scalarValue !== scalar) (mounted.dom as CharacterData).data = scalar;
		mounted.scalarValue = scalar;
		bindText(mounted, value);
		return mounted;
	}
	const replacement = mountDetachedOperation(root, value, parentInstance, parentScope, parent);
	if (!mounted) return replacement;
	placeMountedBefore(root, parent, replacement, mounted.dom);
	if (!releaseMountedRange(root, parent, mounted, 'reconcile-replaced')) {
		unmountMounted(mounted);
		removeMountedNodes(parent, mounted);
	}
	return replacement;
}
