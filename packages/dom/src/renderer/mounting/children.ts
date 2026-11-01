import {
	assertComponentOperationProvider,
	isOpaqueOperation
} from '@exactjs/core/runtime/component-operations';
import { clientComponentInputProvider } from '../component-input-admission.js';
import {
	takeSuppliedPlacement,
	validateSuppliedPlacement
} from '../supplied-placement-capability.js';
import { type AnyComponentInstance, type Child } from '@exactjs/core';
import { executeOpaqueOperation } from '@exactjs/core/runtime/component-operations';
import { createEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import { placeMountedBefore } from '../../placement.js';
import { adoptServerSlot } from '../../server-slots.js';
import type { Mounted, Root } from '../../types.js';
import { countDomWork } from '../limits.js';
import { rollbackMountedChildren } from '../teardown.js';
import { takeParkedOperation } from './operation-parking.js';
import { domEnhancementCapability } from '../enhancement-capability.js';
import { assertUniqueChildKeys } from '../child-keys.js';
import { scalarText } from '../scalar-child.js';
import { bindText } from '../patching/text-binding.js';
import { retainPortalEventContainer } from '../portal-target-lifetime.js';
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
	if (isOpaqueOperation(value))
		assertComponentOperationProvider(value, clientComponentInputProvider);
	const parked =
		takeSuppliedPlacement(root, value, parentInstance, parentScope, parentNode) ??
		takeParkedOperation(root, value, parentInstance, parentScope);
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
	for (const child of children)
		if (isOpaqueOperation(child))
			assertComponentOperationProvider(child, clientComponentInputProvider);
	validateSuppliedPlacement(parentInstance, root);
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
			if (root.componentInputAttempt?.disposed) break;
			const parked =
				takeSuppliedPlacement(root, child, parentInstance, parentScope, parentNode) ??
				takeParkedOperation(root, child, parentInstance, parentScope);
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
				const current = retainMountedOperation(executed.value, child);
				if (root.suppliedPlacementPlan?.pending && root.suppliedPlacementPlan.isCurrent())
					root.suppliedPlacementPlan.own(current);
				mounted.push(current);
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
				if (root.suppliedPlacementPlan?.pending && root.suppliedPlacementPlan.isCurrent())
					root.suppliedPlacementPlan.own(textMounted);
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
	mounted.stop = retainPortalEventContainer(root, eventContainer);
	try {
		mounted.children = withEventContainer(root, eventContainer, () =>
			mountChildren(root, target, [...receipt.children], parentInstance, scope)
		);
		return mounted;
	} catch (error) {
		rollbackMountedChildren([mounted], undefined, error);
		throw error;
	}
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
	if (!capability || !capability.has(value)) return undefined;
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
	if ((root.enhancementNesting ?? 0) > 0) return undefined;
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
