import type { AnyComponentInstance, Child } from '@exactjs/core';
import {
	exactRenderProgramOperation,
	type ExactRenderProgramOperationTarget,
	type ExactRenderProgramReceipt,
	type ExactRenderProgramReceiptData
} from '@exactjs/core/runtime/render-operations';
import {
	exactComponentOperation,
	exactActivityOperation,
	exactChildRangeOperation,
	exactFragmentOperation,
	exactIntrinsicOperation,
	exactKeyedChildOperation,
	exactPortalOperation,
	exactServerBoundaryOperation,
	exactServerSlotOperation,
	exactSuspenseOperation,
	exactTargetOperation,
	exactUnsafeHtmlOperation,
	type ExactActivityOperationTarget,
	type ExactActivityReceipt,
	type ExactActivityReceiptData,
	type ExactChildRangeOperationTarget,
	type ExactChildRangeReceipt,
	type ExactChildRangeReceiptData,
	type ExactComponentOperationTarget,
	type ExactComponentReceipt,
	type ExactComponentReceiptData,
	type ExactFragmentOperationTarget,
	type ExactFragmentReceipt,
	type ExactFragmentReceiptData,
	type ExactIntrinsicOperationTarget,
	type ExactIntrinsicReceipt,
	type ExactIntrinsicReceiptData,
	type ExactKeyedChildOperationTarget,
	type ExactKeyedChildReceipt,
	type ExactKeyedChildReceiptData,
	type ExactPortalOperationTarget,
	type ExactPortalReceipt,
	type ExactPortalReceiptData,
	type ExactServerBoundaryOperationTarget,
	type ExactServerBoundaryReceipt,
	type ExactServerBoundaryReceiptData,
	type ExactServerSlotOperationTarget,
	type ExactServerSlotReceipt,
	type ExactServerSlotReceiptData,
	type ExactSuspenseOperationTarget,
	type ExactSuspenseReceipt,
	type ExactSuspenseReceiptData,
	type ExactTargetOperationTarget,
	type ExactTargetReceipt,
	type ExactTargetReceiptData,
	type ExactUnsafeHtmlOperationTarget,
	type ExactUnsafeHtmlReceipt,
	type ExactUnsafeHtmlReceiptData
} from '@exactjs/core/runtime/component-operations';
import {
	createEffectScope,
	transferEffectScope,
	type EffectScope
} from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../../types.js';
import { mountComponentReceipt } from './native-component-artifact.js';
import { mountIntrinsicReceipt } from './intrinsic-receipt.js';
import { mountChildRangeReceipt } from '../child-range-receipt.js';
import { mountFragmentReceipt } from '../structural-range-receipt.js';
import { requireStructuralBoundaryCapability } from '../structural-capability.js';
import { requireTargetDomCapability } from '../target-capability.js';
import { requireUnsafeHtmlDomCapability } from '../unsafe-html-capability.js';
import { mountDetachedChildren, mountPortalReceipt } from './children.js';
import { mountServerSlotReceipt } from '../../server-slots.js';
import { mountRenderProgram } from '../render-program-operation.js';
import { withTreeDepth } from '../limits.js';

/**
 * Redeems compiler-issued operations without inspecting an operation kind or payload at the call
 * site. Each operation invokes one shared symbol method selected when the compiler created it.
 */
export class NativeMountOperationTarget
	implements
		ExactActivityOperationTarget<Mounted>,
		ExactChildRangeOperationTarget<Mounted>,
		ExactComponentOperationTarget<Mounted>,
		ExactFragmentOperationTarget<Mounted>,
		ExactIntrinsicOperationTarget<Mounted>,
		ExactKeyedChildOperationTarget<Mounted>,
		ExactPortalOperationTarget<Mounted>,
		ExactRenderProgramOperationTarget<Mounted>,
		ExactServerBoundaryOperationTarget<Mounted>,
		ExactServerSlotOperationTarget<Mounted>,
		ExactSuspenseOperationTarget<Mounted>,
		ExactTargetOperationTarget<Mounted>,
		ExactUnsafeHtmlOperationTarget<Mounted>
{
	constructor(
		private readonly root: Root,
		private readonly parentInstance: AnyComponentInstance | undefined,
		private readonly parentScope: EffectScope | undefined,
		private readonly parentNode: Node | undefined
	) {}

	/** Mounts a compiler-issued component operation into this target. */
	[exactComponentOperation](
		_operation: ExactComponentReceipt,
		data: ExactComponentReceiptData
	): Mounted {
		return mountComponentReceipt(
			this.root,
			data,
			this.parentInstance,
			this.parentScope,
			this.parentNode
		);
	}

	/** Mounts a compiler-closed render program into this target. */
	[exactRenderProgramOperation](
		operation: ExactRenderProgramReceipt,
		_data: ExactRenderProgramReceiptData
	): Mounted {
		const mounted = mountRenderProgram(
			this.root,
			operation,
			createEffectScope(this.parentScope),
			this.parentInstance,
			this.parentNode
		);
		if (!mounted) throw new Error('Compiler-closed render program could not be mounted');
		return mounted;
	}

	/** Mounts a compiler-issued intrinsic operation into this target. */
	[exactIntrinsicOperation](
		_operation: ExactIntrinsicReceipt,
		data: ExactIntrinsicReceiptData
	): Mounted {
		return withTreeDepth(this.root, () =>
			mountIntrinsicReceipt(
				this.root,
				data,
				createEffectScope(this.parentScope),
				this.parentInstance,
				this.parentNode
			)
		);
	}

	/** Mounts a compiler-issued fragment range into this target. */
	[exactFragmentOperation](
		_operation: ExactFragmentReceipt,
		data: ExactFragmentReceiptData
	): Mounted {
		return mountFragmentReceipt(
			this.root,
			data,
			createEffectScope(this.parentScope),
			this.parentInstance,
			this.parentNode
		);
	}

	/** Mounts a compiler-issued semantic target range. */
	[exactTargetOperation](_operation: ExactTargetReceipt, data: ExactTargetReceiptData): Mounted {
		return requireTargetDomCapability().mount(
			this.root,
			data,
			createEffectScope(this.parentScope),
			this.parentInstance,
			this.parentNode
		);
	}

	/** Mounts a focused compiler-owned child range. */
	[exactChildRangeOperation](
		_operation: ExactChildRangeReceipt,
		data: ExactChildRangeReceiptData
	): Mounted {
		return mountChildRangeReceipt(
			this.root,
			data,
			createEffectScope(this.parentScope),
			this.parentInstance,
			this.parentNode
		);
	}

	/** Mounts a retained Activity boundary through its installed capability. */
	[exactActivityOperation](
		_operation: ExactActivityReceipt,
		data: ExactActivityReceiptData
	): Mounted {
		return requireStructuralBoundaryCapability().mountActivityReceipt(
			this.root,
			data,
			createEffectScope(this.parentScope),
			this.parentInstance,
			this.parentNode
		);
	}

	/** Mounts a Suspense boundary through its installed capability. */
	[exactSuspenseOperation](
		_operation: ExactSuspenseReceipt,
		data: ExactSuspenseReceiptData
	): Mounted {
		return requireStructuralBoundaryCapability().mountSuspenseReceipt(
			this.root,
			data,
			createEffectScope(this.parentScope),
			this.parentInstance,
			this.parentNode
		);
	}

	/** Mounts audited raw HTML through its installed capability. */
	[exactUnsafeHtmlOperation](
		_operation: ExactUnsafeHtmlReceipt,
		data: ExactUnsafeHtmlReceiptData
	): Mounted {
		return requireUnsafeHtmlDomCapability().mount(this.root, data, this.parentScope);
	}

	/** Mounts one compiler-owned keyed child range. */
	[exactKeyedChildOperation](
		operation: ExactKeyedChildReceipt,
		data: ExactKeyedChildReceiptData
	): Mounted {
		const itemScope = data.ownerScope ?? createEffectScope(this.parentScope);
		if (data.ownerScope) transferEffectScope(itemScope, this.parentScope);
		const child = mountDetachedChildren(
			this.root,
			[data.value] as Child[],
			this.parentInstance,
			itemScope,
			this.parentNode
		)[0];
		if (!child) {
			itemScope.stop();
			throw new Error('A keyed compiler operation must contribute one child range');
		}
		return {
			operation,
			operationKey: data.key,
			range: 'item',
			dom: child.dom,
			...(child.end ? { end: child.end } : {}),
			scope: itemScope,
			children: [child]
		};
	}

	/** Mounts a compiler-issued portal in its foreign container. */
	[exactPortalOperation](_operation: ExactPortalReceipt, data: ExactPortalReceiptData): Mounted {
		return mountPortalReceipt(this.root, data, this.parentInstance, this.parentScope);
	}

	/** Rejects a server-only publication at the client DOM boundary. */
	[exactServerBoundaryOperation](
		_operation: ExactServerBoundaryReceipt,
		data: ExactServerBoundaryReceiptData
	): Mounted {
		throw new TypeError(`A server boundary cannot be mounted by the DOM target (${data.name})`);
	}

	/** Mounts a retained server slot for client hydration ownership. */
	[exactServerSlotOperation](
		_operation: ExactServerSlotReceipt,
		data: ExactServerSlotReceiptData
	): Mounted {
		return mountServerSlotReceipt(this.root, data, createEffectScope(this.parentScope));
	}
}

/** Retains the authored operation as the opaque identity used by later target updates. */
export function retainMountedOperation(mounted: Mounted, operation: Child): Mounted {
	mounted.operation = operation;
	return mounted;
}
