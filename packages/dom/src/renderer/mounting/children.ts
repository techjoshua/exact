import {
	type AnyComponentInstance,
	attachSuppressedCleanupFailure,
	type Child
} from '@exactjs/core';
import { executeOpaqueOperation } from '@exactjs/core/runtime/component-operations';
import { type EffectScope } from '@exactjs/reactive/framework/runtime';
import { placeMountedBefore } from '../../placement.js';
import { adoptServerSlot } from '../../server-slots.js';
import type { Mounted, Root } from '../../types.js';
import { countDomWork } from '../limits.js';
import { disposeMounted } from '../teardown.js';
import { takeParkedOperation } from './operation-parking.js';
import { createEffectScope } from '@exactjs/reactive/framework/runtime';
import { domEnhancementCapability } from '../enhancement-capability.js';
import { assertUniqueChildKeys } from '../child-keys.js';
import { scalarText } from '../scalar-child.js';
import { bindText } from '../patching/text-binding.js';
import { portalEventContainer, portalTarget, withEventContainer } from '../portal-routing.js';
import { NativeMountOperationTarget, retainMountedOperation } from './native-operation-target.js';

/** Mounts one opaque compiler or compatibility child operation. */
export function mountDetachedOperation(
	root: Root,
	value: Child,
	parentInstance?: AnyComponentInstance,
	parentScope?: EffectScope,
	parentNode?: Node
): Mounted {
	const parked = takeParkedOperation(root, value, parentInstance, parentScope);
	if (parked) return parked;
	const mounted = mountDetachedChildren(root, [value], parentInstance, parentScope, parentNode);
	if (mounted.length !== 1)
		throw new Error('A renderer child operation must contribute exactly one mounted range');
	return mounted[0]!;
}

/** Performs the mount detached children domain operation. */
export function mountDetachedChildren(
	root: Root,
	children: Child[],
	parentInstance?: AnyComponentInstance,
	parentScope?: EffectScope,
	parentNode?: Node
): Mounted[] {
	assertUniqueChildKeys(children);
	const mounted: Mounted[] = [];
	const operationTarget = new NativeMountOperationTarget(
		root,
		parentInstance,
		parentScope,
		parentNode
	);
	try {
		for (const child of children) {
			const parked = takeParkedOperation(root, child, parentInstance, parentScope);
			if (parked) {
				mounted.push(parked);
				continue;
			}
			const enhanced = mountEnhancedCompilerOperation(
				root,
				child,
				parentInstance,
				parentScope,
				parentNode
			);
			if (enhanced) {
				mounted.push(enhanced);
				continue;
			}
			const executed = executeOpaqueOperation<Mounted>(child, operationTarget);
			if (executed) {
				mounted.push(retainMountedOperation(executed.value, child));
				continue;
			}
			const scalar = scalarText(child);
			if (scalar !== undefined) {
				countDomWork(root);
				const scope = createEffectScope(parentScope);
				const textMounted: Mounted = {
					scalar: true,
					scalarValue: scalar,
					dom: document.createTextNode(scalar),
					scope,
					children: []
				};
				bindText(textMounted, child);
				mounted.push(textMounted);
				continue;
			}
			if (child === null || child === undefined || child === false || child === true) {
				countDomWork(root);
				continue;
			}
			throw new TypeError(
				'Native eXact children must be compiler-issued operations, scalar values, or empty placeholders'
			);
		}
		return mounted;
	} catch (error) {
		rollbackMountedChildren(mounted, undefined, error);
		throw error;
	}
}

/** Mounts one focused portal operation while retaining logical ownership in its source tree. */
export function mountPortalReceipt(
	root: Root,
	receipt: import('@exactjs/core/runtime/component-operations').ExactPortalReceiptData,
	parentInstance?: AnyComponentInstance,
	parentScope?: EffectScope
): Mounted {
	const scope = createEffectScope(parentScope);
	const marker = document.createComment('exact:portal');
	const target = portalTarget(receipt);
	const mounted: Mounted = {
		portalReceipt: receipt,
		dom: marker,
		scope,
		children: [],
		portalTarget: target
	};
	const eventContainer = portalEventContainer(root, target);
	if (eventContainer === target) root.portalTargets.add(target);
	mounted.children = withEventContainer(root, eventContainer, () =>
		mountChildren(root, target, [...receipt.children], parentInstance, scope)
	);
	return mounted;
}

/** Performs the mount children domain operation. */
export function mountChildren(
	root: Root,
	parent: Node,
	children: Child[],
	parentInstance?: AnyComponentInstance,
	parentScope?: EffectScope
): Mounted[] {
	const mounted = mountDetachedChildren(root, children, parentInstance, parentScope, parent);
	try {
		for (const childMounted of mounted) {
			if (childMounted.serverSlotReceipt) adoptServerSlot(parent, childMounted);
			placeMountedBefore(root, parent, childMounted, null);
		}
		return mounted;
	} catch (error) {
		rollbackMountedChildren(mounted, parent, error);
		throw error;
	}
}

/** Applies compiler-carried enhancement declarations without interpreting target topology. */
function mountEnhancedCompilerOperation(
	root: Root,
	value: Child,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope | undefined,
	parentNode: Node | undefined
): Mounted | undefined {
	const capability = domEnhancementCapability();
	if (!capability || !capability.has(value) || (root.enhancementNesting ?? 0) > 0) return undefined;
	const mountOperation = (
		next: Child,
		instance: AnyComponentInstance | undefined,
		scope: EffectScope | undefined,
		node: Node | undefined
	) => {
		const mounted = mountDetachedOperation(root, next, instance, scope, node);
		mounted.operation = next;
		return mounted;
	};
	capability.install(root, mountOperation);
	const direct = capability.mountDirect?.(root, value, parentInstance, parentScope, mountOperation);
	if (direct) return direct;
	root.enhancementNesting = 1;
	try {
		return capability.activate(
			root,
			mountOperation(value, parentInstance, parentScope, parentNode),
			parentInstance,
			parentScope,
			mountOperation
		);
	} finally {
		root.enhancementNesting = 0;
	}
}

/**
 * Rolls back provisional children in reverse ownership order.
 *
 * Detached roots use a temporary parent only as the traversal origin; portal
 * descendants still remove themselves from their actual portal targets.
 */
function rollbackMountedChildren(
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
