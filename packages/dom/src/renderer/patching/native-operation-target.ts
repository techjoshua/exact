import {
	assertComponentOperationProvider,
	isOpaqueOperation
} from '@exactjs/core/runtime/component-operations';
import { clientComponentInputProvider } from '../component-input-admission.js';
import { readClientComponentInput } from '../component-input-admission.js';
import { componentContractVersion } from '../../component-contract-version.js';
import { assertComponentInputVersion } from '@exactjs/core/runtime/component-operations';
import { retainNamespaceProps } from '../../namespace.js';
import type { AnyComponentInstance, Child } from '@exactjs/core';
import {
	exactActivityOperation,
	exactChildRangeOperation,
	exactComponentInputsOperationV6,
	exactFragmentOperation,
	exactIntrinsicOperation,
	exactKeyedChildOperation,
	exactPortalOperation,
	exactServerBoundaryOperation,
	exactServerSlotOperation,
	exactSuspenseOperation,
	exactTargetOperation,
	exactUnsafeHtmlOperation,
	executeOpaqueOperation,
	type ExactActivityOperationTarget,
	type ExactActivityReceipt,
	type ExactActivityReceiptData,
	type ExactChildRangeOperationTarget,
	type ExactChildRangeReceipt,
	type ExactChildRangeReceiptData,
	type ExactComponentInputsOperationTarget,
	type ExactComponentReceipt,
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
	exactRenderProgramOperation,
	type ExactRenderProgramOperationTarget,
	type ExactRenderProgramReceipt,
	type ExactRenderProgramReceiptData
} from '@exactjs/core/runtime/render-operations';
import type { EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../../types.js';
import { patchChildRangeReceipt } from '../child-range-receipt.js';
import { receiveComponentReceipt } from '../mounting/native-component-artifact.js';
import { patchRenderProgram } from '../render-program-operation.js';
import { requireStructuralBoundaryCapability } from '../structural-capability.js';
import { patchFragmentReceipt } from '../structural-range-receipt.js';
import { requireTargetDomCapability, updateTargetedIntrinsicProps } from '../target-capability.js';
import { requireUnsafeHtmlDomCapability } from '../unsafe-html-capability.js';
import { patchChildren } from './children.js';
import { patchKeyedOperation } from './keyed-operation.js';
import { patchPortalReceipt } from './portal.js';
import { intrinsicChildContainer } from '../intrinsic-child-container.js';
import { intrinsicTextChildren } from '../intrinsic-text.js';

type PatchResult = Mounted | undefined;

/** DOM target that decides in-place compatibility and applies one opaque component operation. */
class NativePatchOperationTarget
	implements
		ExactActivityOperationTarget<PatchResult>,
		ExactChildRangeOperationTarget<PatchResult>,
		ExactComponentInputsOperationTarget<PatchResult>,
		ExactFragmentOperationTarget<PatchResult>,
		ExactIntrinsicOperationTarget<PatchResult>,
		ExactKeyedChildOperationTarget<PatchResult>,
		ExactPortalOperationTarget<PatchResult>,
		ExactRenderProgramOperationTarget<PatchResult>,
		ExactServerBoundaryOperationTarget<PatchResult>,
		ExactServerSlotOperationTarget<PatchResult>,
		ExactSuspenseOperationTarget<PatchResult>,
		ExactTargetOperationTarget<PatchResult>,
		ExactUnsafeHtmlOperationTarget<PatchResult>
{
	constructor(
		private readonly mounted: Mounted,
		private readonly root?: Root,
		private readonly parent?: Node,
		private readonly parentInstance?: AnyComponentInstance,
		private readonly parentScope?: EffectScope,
		private readonly structuralOwner?: Mounted
	) {}

	[exactKeyedChildOperation](
		operation: ExactKeyedChildReceipt,
		data: ExactKeyedChildReceiptData
	): PatchResult {
		if (this.mounted.operationKey !== data.key) return undefined;
		if (!this.root || !this.parent) return this.mounted;
		return patchKeyedOperation(
			this.root,
			this.parent,
			this.mounted,
			operation,
			data,
			this.parentInstance,
			this.parentScope,
			this.structuralOwner
		);
	}

	[exactRenderProgramOperation](
		operation: ExactRenderProgramReceipt,
		data: ExactRenderProgramReceiptData
	): PatchResult {
		if (this.mounted.renderProgram?.invocation.program.id !== data.invocation.program.id)
			return undefined;
		if (!this.root || !this.parent) return this.mounted;
		return patchRenderProgram(this.mounted, operation) ? this.mounted : undefined;
	}

	[exactComponentInputsOperationV6](operation: ExactComponentReceipt): PatchResult {
		const data = readClientComponentInput(operation)!;
		const previous = this.mounted.componentReceipt;
		if (
			previous?.contract.artifact !== data.contract.artifact ||
			previous.key !== data.key ||
			previous.domain !== data.domain
		)
			return undefined;
		if (!this.root || !this.parent) return this.mounted;
		return receiveComponentReceipt(this.mounted, data).committed ? this.mounted : undefined;
	}

	[exactIntrinsicOperation](
		_operation: ExactIntrinsicReceipt,
		data: ExactIntrinsicReceiptData
	): PatchResult {
		const previous = this.mounted.intrinsicReceipt;
		if (previous?.tag !== data.tag || previous.key !== data.key || previous.domain !== data.domain)
			return undefined;
		if (!this.root || !this.parent) return this.mounted;
		this.mounted.intrinsicReceipt = data;
		if (this.mounted.dom instanceof Element) retainNamespaceProps(this.mounted.dom, data.props);
		const textPresentation = this.mounted.children[0]?.textHostPresentation;
		if (textPresentation) textPresentation.receive(data.children);
		else
			this.mounted.children = patchChildren(
				this.root,
				intrinsicChildContainer(this.mounted.dom),
				this.mounted.children,
				[...intrinsicTextChildren(this.root, data.tag, data.children)],
				this.parentInstance,
				this.mounted.scope,
				undefined,
				this.mounted
			);
		updateTargetedIntrinsicProps(this.root, this.mounted, { ...previous.props }, { ...data.props });
		return this.mounted;
	}

	[exactChildRangeOperation](
		_operation: ExactChildRangeReceipt,
		data: ExactChildRangeReceiptData
	): PatchResult {
		const previous = this.mounted.childRangeReceipt;
		if (!previous || previous.markerId !== data.markerId || previous.domain !== data.domain)
			return undefined;
		if (!this.root || !this.parent) return this.mounted;
		patchChildRangeReceipt(this.root, this.parent, this.mounted, data, this.parentInstance);
		return this.mounted;
	}

	[exactActivityOperation](
		_operation: ExactActivityReceipt,
		data: ExactActivityReceiptData
	): PatchResult {
		if (this.mounted.activityReceipt?.domain !== data.domain) return undefined;
		if (!this.root || !this.parent) return this.mounted;
		requireStructuralBoundaryCapability().patchActivityReceipt(
			this.root,
			this.parent,
			this.mounted,
			data
		);
		return this.mounted;
	}

	[exactSuspenseOperation](
		_operation: ExactSuspenseReceipt,
		data: ExactSuspenseReceiptData
	): PatchResult {
		if (this.mounted.suspenseReceipt?.domain !== data.domain) return undefined;
		if (!this.root || !this.parent) return this.mounted;
		requireStructuralBoundaryCapability().patchSuspenseReceipt(
			this.root,
			this.parent,
			this.mounted,
			data,
			this.parentInstance
		);
		return this.mounted;
	}

	[exactFragmentOperation](
		_operation: ExactFragmentReceipt,
		data: ExactFragmentReceiptData
	): PatchResult {
		const previous = this.mounted.fragmentReceipt;
		if (!previous || previous.key !== data.key || previous.domain !== data.domain) return undefined;
		if (!!previous.presentation !== !!data.presentation) return undefined;
		if (!this.root || !this.parent) return this.mounted;
		if (data.presentation)
			return requireTargetDomCapability().patchFragmentPresentation(
				this.root,
				this.parent,
				this.mounted,
				data,
				this.parentInstance
			);
		patchFragmentReceipt(this.root, this.parent, this.mounted, data, this.parentInstance);
		return this.mounted;
	}

	[exactTargetOperation](
		_operation: ExactTargetReceipt,
		data: ExactTargetReceiptData
	): PatchResult {
		const previous = this.mounted.targetReceipt;
		if (!previous || previous.key !== data.key || previous.domain !== data.domain) return undefined;
		if (!this.root || !this.parent) return this.mounted;
		requireTargetDomCapability().patch(
			this.root,
			this.parent,
			this.mounted,
			data,
			this.parentInstance
		);
		return this.mounted;
	}

	[exactUnsafeHtmlOperation](
		_operation: ExactUnsafeHtmlReceipt,
		data: ExactUnsafeHtmlReceiptData
	): PatchResult {
		if (this.mounted.unsafeHtmlReceipt?.domain !== data.domain) return undefined;
		if (!this.root || !this.parent) return this.mounted;
		this.mounted.unsafeHtmlReceipt = data;
		const capability = requireUnsafeHtmlDomCapability();
		capability.assertAllowed(this.root);
		capability.bind(this.root, this.mounted, data.value);
		return this.mounted;
	}

	[exactPortalOperation](
		_operation: ExactPortalReceipt,
		data: ExactPortalReceiptData
	): PatchResult {
		if (this.mounted.portalReceipt?.domain !== data.domain) return undefined;
		if (!this.root || !this.parent) return this.mounted;
		patchPortalReceipt(this.root, this.mounted, data, this.parentInstance);
		return this.mounted;
	}

	[exactServerBoundaryOperation](
		_operation: ExactServerBoundaryReceipt,
		_data: ExactServerBoundaryReceiptData
	): PatchResult {
		return undefined;
	}

	[exactServerSlotOperation](
		_operation: ExactServerSlotReceipt,
		data: ExactServerSlotReceiptData
	): PatchResult {
		if (this.mounted.serverSlotReceipt?.id !== data.id) return undefined;
		if (!this.root || !this.parent) return this.mounted;
		this.mounted.serverSlotReceipt = data;
		return this.mounted;
	}
}

/** Reports whether a mounted range can receive an opaque operation without replacement. */
export function canPatchOpaqueOperation(mounted: Mounted, value: unknown): boolean {
	if (isOpaqueOperation(value))
		assertComponentOperationProvider(value, clientComponentInputProvider);
	return (
		executeOpaqueOperation<PatchResult>(value, new NativePatchOperationTarget(mounted))?.value !==
		undefined
	);
}

/** Applies one opaque operation when its target-specific identity matches the mounted range. */
export function patchOpaqueOperation(
	root: Root,
	parent: Node,
	mounted: Mounted,
	value: Child,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope | undefined,
	structuralOwner: Mounted | undefined
): Mounted | undefined {
	if (isOpaqueOperation(value))
		assertComponentOperationProvider(value, clientComponentInputProvider);
	const result = executeOpaqueOperation<PatchResult>(
		value,
		new NativePatchOperationTarget(
			mounted,
			root,
			parent,
			parentInstance,
			parentScope,
			structuralOwner
		)
	)?.value;
	if (result) result.operation = value;
	return result;
}

// The private operation capability is required even by direct receipt-adoption lanes.
assertComponentInputVersion(componentContractVersion);
