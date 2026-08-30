import {
	exactActivityOperation,
	exactChildRangeOperation,
	exactComponentOperation,
	exactFragmentOperation,
	exactIntrinsicOperation,
	exactKeyedChildOperation,
	exactPortalOperation,
	exactServerBoundaryOperation,
	exactServerSlotOperation,
	exactSuspenseOperation,
	exactTargetOperation,
	exactUnsafeHtmlOperation,
	withoutCompiledFragmentReceiptEnhancement,
	withoutCompiledIntrinsicReceiptEnhancement,
	withoutCompiledSuspenseReceiptEnhancement,
	type ExactActivityReceiptData,
	type ExactChildRangeReceiptData,
	type ExactComponentReceiptData,
	type ExactFragmentReceiptData,
	type ExactIntrinsicReceiptData,
	type ExactKeyedChildReceiptData,
	type ExactPortalReceiptData,
	type ExactServerBoundaryReceiptData,
	type ExactServerSlotReceiptData,
	type ExactSuspenseReceiptData,
	type ExactTargetReceiptData,
	type ExactUnsafeHtmlReceiptData
} from '@exactjs/core/runtime/component-operations';
import {
	exactRenderProgramOperation,
	type ExactRenderProgramReceiptData,
	withoutRenderProgramReceiptEnhancement
} from '@exactjs/core/runtime/render-operations';
import {
	isFiniteClientBoundary,
	normalizeRenderResult,
	type AnyComponentInstance
} from '@exactjs/core';
import { unwrap } from '@exactjs/reactive/framework/values';
import { readPreparedServerRenderProgram } from '@exactjs/core/framework/server-render-structure';
import type { ExactPreparedServerChildRange } from '@exactjs/core/framework/server-render-structure';
import type { ExactPreparedServerKeyedChild } from '@exactjs/core/framework/server-render-structure';
import type { Child, SsrContext } from '../types.js';
import { exactMarkerId, markerId, markerPair } from '../markup.js';
import { renderIntrinsicReceipt } from './intrinsic-receipt.js';
import { renderPreparedSsrProgramString } from './render-program.js';
import { registerDynamicComponentPreload } from './resource-hints.js';
import { renderServerBoundary } from './server-boundary-capability.js';
import { serverSlotOpening, serverSlotReceiptReference } from './server-slots.js';
import {
	renderActivityReceipt,
	renderFragmentReceipt,
	renderKeyedChildReceipt,
	renderSuspenseReceipt,
	renderTargetReceipt
} from './structural-receipts.js';
import { renderSyncComponentReceipt } from './sync-component.js';
import { renderUnsafeHtmlValue } from './host.js';
import { renderOperationEnhancements } from './operation-enhancements.js';
import { exactSerializedSsrHtmlOperation } from './serialized-html-operation.js';
import type { ServerComponentReference } from './server-component-reference.js';

type RenderChildren = (
	context: SsrContext,
	children: readonly Child[],
	parent?: AnyComponentInstance,
	hasComponentAncestor?: boolean
) => string;

/** Sync SSR target selected directly by each opaque compiler-issued operation. */
export class SyncSsrOperationTarget {
	constructor(
		private readonly context: SsrContext,
		private readonly parent: AnyComponentInstance | undefined,
		private readonly hasComponentAncestor: boolean,
		private readonly renderChildren: RenderChildren
	) {}

	/** Serializes a synchronous component operation. */
	[exactComponentOperation](_operation: object, data: ExactComponentReceiptData): string {
		this.context.enhancementOperationComponentDepth =
			(this.context.enhancementOperationComponentDepth ?? 0) + 1;
		try {
			return this.renderComponent(data, this.parent, this.hasComponentAncestor);
		} finally {
			this.context.enhancementOperationComponentDepth!--;
		}
	}

	/** Serializes an intrinsic operation and any enhancement wrapper. */
	[exactIntrinsicOperation](operation: object, data: ExactIntrinsicReceiptData): string {
		return renderOperationEnhancements(
			this.context,
			data.enhancement,
			() =>
				renderIntrinsicReceipt(
					this.context,
					data,
					this.parent,
					this.hasComponentAncestor,
					this.renderChildren
				),
			this.parent,
			this.renderChildren,
			withoutCompiledIntrinsicReceiptEnhancement(operation)
		);
	}

	/** Serializes one keyed child while preserving marker identity. */
	[exactKeyedChildOperation](_operation: object, data: ExactKeyedChildReceiptData): string {
		return this.renderKeyedChild(data);
	}

	/** Serializes one direct compiler-closed keyed server child. */
	renderDirectServerKeyedChild(data: ExactPreparedServerKeyedChild): string {
		return this.renderKeyedChild(data);
	}

	private renderKeyedChild(
		data: ExactPreparedServerKeyedChild | ExactKeyedChildReceiptData
	): string {
		const program = readPreparedServerRenderProgram(data.value);
		if (program)
			return markerPair(this.context, markerId(this.context, 'item', undefined, data.key), () =>
				renderPreparedSsrProgramString(
					this.context,
					program,
					this.parent,
					(children) =>
						this.renderChildren(this.context, children, this.parent, this.hasComponentAncestor),
					(component) =>
						this.renderComponent(component, this.parent, this.hasComponentAncestor, true)
				)
			);
		return renderKeyedChildReceipt(
			this.context,
			data as ExactKeyedChildReceiptData,
			this.parent,
			this.hasComponentAncestor,
			this.renderChildren
		);
	}

	/** Serializes a synchronously settling Suspense operation. */
	[exactSuspenseOperation](operation: object, data: ExactSuspenseReceiptData): string {
		return renderOperationEnhancements(
			this.context,
			data.enhancement,
			() =>
				renderSuspenseReceipt(
					this.context,
					data,
					this.parent,
					this.hasComponentAncestor,
					this.renderChildren
				),
			this.parent,
			this.renderChildren,
			withoutCompiledSuspenseReceiptEnhancement(operation)
		);
	}

	/** Serializes the currently selected Activity content. */
	[exactActivityOperation](_operation: object, data: ExactActivityReceiptData): string {
		return renderActivityReceipt(
			this.context,
			data,
			this.parent,
			this.hasComponentAncestor,
			this.renderChildren
		);
	}

	/** Serializes a transparent compiler-owned fragment range. */
	[exactFragmentOperation](operation: object, data: ExactFragmentReceiptData): string {
		return renderOperationEnhancements(
			this.context,
			data.enhancement,
			() =>
				renderFragmentReceipt(
					this.context,
					data,
					this.parent,
					this.hasComponentAncestor,
					this.renderChildren
				),
			this.parent,
			this.renderChildren,
			withoutCompiledFragmentReceiptEnhancement(operation)
		);
	}

	/** Serializes the children selected by a semantic target operation. */
	[exactTargetOperation](_operation: object, data: ExactTargetReceiptData): string {
		return renderTargetReceipt(
			this.context,
			data,
			this.parent,
			this.hasComponentAncestor,
			this.renderChildren
		);
	}

	/** Serializes a focused dynamic child range. */
	[exactChildRangeOperation](_operation: object, data: ExactChildRangeReceiptData): string {
		if (data.dynamicComponent && data.markerId)
			registerDynamicComponentPreload(this.context, data.markerId);
		return this.renderChildRange(data, !!data.dynamicComponent);
	}

	/** Serializes one direct compiler-closed server child range. */
	renderDirectServerChildRange(data: ExactPreparedServerChildRange): string {
		return this.renderChildRange(data, false);
	}

	private renderChildRange(
		data: ExactPreparedServerChildRange | ExactChildRangeReceiptData,
		dynamicComponent: boolean
	): string {
		const identity = data.markerId
			? `dynamic:${exactMarkerId(data.markerId)}`
			: markerId(this.context, 'dynamic');
		return markerPair(this.context, identity, () =>
			dynamicComponent
				? ''
				: this.renderChildren(
						this.context,
						normalizeRenderResult(unwrap(data.value) as Child | Child[]),
						this.parent,
						this.hasComponentAncestor
					)
		);
	}

	/** Serializes audited raw HTML without reparsing it. */
	[exactUnsafeHtmlOperation](_operation: object, data: ExactUnsafeHtmlReceiptData): string {
		return markerPair(this.context, markerId(this.context, 'unsafe-html'), () =>
			renderUnsafeHtmlValue(this.context, data.value)
		);
	}

	/** Serializes a client-island publication boundary. */
	[exactServerBoundaryOperation](operation: object, data: ExactServerBoundaryReceiptData): string {
		return renderServerBoundary(this.context, data, isFiniteClientBoundary(operation));
	}

	/** Serializes a retained server-owned child slot. */
	[exactServerSlotOperation](_operation: object, data: ExactServerSlotReceiptData): string {
		return data.children.length
			? `${serverSlotOpening(serverSlotReceiptReference(data), this.context)}${this.renderChildren(this.context, data.children, this.parent, this.hasComponentAncestor)}</span>`
			: '';
	}

	/** Serializes portal children in logical ownership order. */
	[exactPortalOperation](_operation: object, data: ExactPortalReceiptData): string {
		return this.renderChildren(this.context, data.children, this.parent, this.hasComponentAncestor);
	}

	/** Serializes a compiler-closed server render program. */
	[exactRenderProgramOperation](operation: object, data: ExactRenderProgramReceiptData): string {
		const program = readPreparedServerRenderProgram(data.invocation);
		if (!program)
			throw new TypeError('Server rendering received a client-only render-program operation');
		return renderOperationEnhancements(
			this.context,
			data.enhancement,
			() => this.renderPreparedServerProgram(program),
			this.parent,
			this.renderChildren,
			withoutRenderProgramReceiptEnhancement(operation)
		);
	}

	/** Serializes a compiler-issued direct server program nested inside another operation. */
	renderPreparedServerProgram(
		program: NonNullable<ReturnType<typeof readPreparedServerRenderProgram>>
	): string {
		return renderPreparedSsrProgramString(
			this.context,
			program,
			this.parent,
			(children) =>
				this.renderChildren(this.context, children, this.parent, this.hasComponentAncestor),
			(component) => this.renderComponent(component, this.parent, this.hasComponentAncestor, true)
		);
	}

	/** Serializes one direct server reference reached outside a prepared render-program segment. */
	renderDirectServerComponent(component: ServerComponentReference): string {
		this.context.enhancementOperationComponentDepth =
			(this.context.enhancementOperationComponentDepth ?? 0) + 1;
		try {
			return this.renderComponent(component, this.parent, this.hasComponentAncestor);
		} finally {
			this.context.enhancementOperationComponentDepth!--;
		}
	}

	/** Serializes a compiler-proven root without its redundant outer component delimiter. */
	renderCompilerClosedRootComponent(component: ServerComponentReference): string {
		return this.renderComponent(component, undefined, false, false, true);
	}

	/** Returns already serialized SSR output without reparsing it. */
	[exactSerializedSsrHtmlOperation](html: string): string {
		return html;
	}

	private renderComponent(
		component: ExactComponentReceiptData,
		parent: AnyComponentInstance | undefined,
		hasComponentAncestor: boolean,
		omitCompilerOwnedBoundary = false,
		omitRootBoundary = false
	): string {
		return renderSyncComponentReceipt(
			this.context,
			component,
			parent,
			hasComponentAncestor,
			{
				renderChildren: this.renderChildren,
				renderComponent: (context, child, owner, ancestor = false, omit = false) =>
					new SyncSsrOperationTarget(context, owner, ancestor, this.renderChildren).renderComponent(
						child,
						owner,
						ancestor,
						omit
					)
			},
			omitCompilerOwnedBoundary,
			omitRootBoundary
		);
	}
}
