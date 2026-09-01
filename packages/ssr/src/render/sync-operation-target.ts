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
import type { AnyExactComponentCallable } from '@exactjs/core/framework/component-contracts';
import { unwrap } from '@exactjs/reactive/framework/values';
import { readPreparedServerRenderProgram } from '@exactjs/core/framework/server-render-structure';
import type { ExactPreparedServerChildRange } from '@exactjs/core/framework/server-render-structure';
import type { ExactPreparedServerKeyedChild } from '@exactjs/core/framework/server-render-structure';
import type { Child, SsrContext } from '../types.js';
import { exactMarkerId, markerId, markerPair } from '../markup.js';
import { renderIntrinsicReceipt } from './intrinsic-receipt.js';
import { renderPreparedSsrProgramString } from './sync-render-program.js';
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
import {
	renderSyncComponentReceipt,
	renderSyncDirectComponent,
	type SyncComponentOperations
} from './sync-component.js';
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
export class SyncSsrOperationTarget implements SyncComponentOperations {
	constructor(
		private readonly context: SsrContext,
		private readonly parent: AnyComponentInstance | undefined,
		private readonly hasComponentAncestor: boolean,
		private readonly renderChildList: RenderChildren
	) {}

	/** Returns the stable child-list operation without allocating a bound callback. */
	get renderChildren(): RenderChildren {
		return this.renderChildList;
	}

	/** Serializes a synchronous component operation. */
	[exactComponentOperation](_operation: object, data: ExactComponentReceiptData): string {
		this.context.enhancementOperationComponentDepth =
			(this.context.enhancementOperationComponentDepth ?? 0) + 1;
		try {
			return this.renderComponentReceipt(data, this.parent, this.hasComponentAncestor);
		} finally {
			this.context.enhancementOperationComponentDepth!--;
		}
	}

	/** Serializes an intrinsic operation and any enhancement wrapper. */
	[exactIntrinsicOperation](operation: object, data: ExactIntrinsicReceiptData): string {
		this.context.outputSink?.invalidateAccounting();
		return renderOperationEnhancements(
			this.context,
			data.enhancement,
			() =>
				renderIntrinsicReceipt(
					this.context,
					data,
					this.parent,
					this.hasComponentAncestor,
					this.renderChildList
				),
			this.parent,
			this.renderChildList,
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
				renderPreparedSsrProgramString(this.context, program, this.parent, this)
			);
		this.context.outputSink?.invalidateAccounting();
		return renderKeyedChildReceipt(
			this.context,
			data as ExactKeyedChildReceiptData,
			this.parent,
			this.hasComponentAncestor,
			this.renderChildList
		);
	}

	/** Serializes a synchronously settling Suspense operation. */
	[exactSuspenseOperation](operation: object, data: ExactSuspenseReceiptData): string {
		this.context.outputSink?.invalidateAccounting();
		return renderOperationEnhancements(
			this.context,
			data.enhancement,
			() =>
				renderSuspenseReceipt(
					this.context,
					data,
					this.parent,
					this.hasComponentAncestor,
					this.renderChildList
				),
			this.parent,
			this.renderChildList,
			withoutCompiledSuspenseReceiptEnhancement(operation)
		);
	}

	/** Serializes the currently selected Activity content. */
	[exactActivityOperation](_operation: object, data: ExactActivityReceiptData): string {
		this.context.outputSink?.invalidateAccounting();
		return renderActivityReceipt(
			this.context,
			data,
			this.parent,
			this.hasComponentAncestor,
			this.renderChildList
		);
	}

	/** Serializes a transparent compiler-owned fragment range. */
	[exactFragmentOperation](operation: object, data: ExactFragmentReceiptData): string {
		this.context.outputSink?.invalidateAccounting();
		return renderOperationEnhancements(
			this.context,
			data.enhancement,
			() =>
				renderFragmentReceipt(
					this.context,
					data,
					this.parent,
					this.hasComponentAncestor,
					this.renderChildList
				),
			this.parent,
			this.renderChildList,
			withoutCompiledFragmentReceiptEnhancement(operation)
		);
	}

	/** Serializes the children selected by a semantic target operation. */
	[exactTargetOperation](_operation: object, data: ExactTargetReceiptData): string {
		this.context.outputSink?.invalidateAccounting();
		return renderTargetReceipt(
			this.context,
			data,
			this.parent,
			this.hasComponentAncestor,
			this.renderChildList
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
				: this.renderChildList(
						this.context,
						normalizeRenderResult(unwrap(data.value) as Child | Child[]),
						this.parent,
						this.hasComponentAncestor
					)
		);
	}

	/** Serializes audited raw HTML without reparsing it. */
	[exactUnsafeHtmlOperation](_operation: object, data: ExactUnsafeHtmlReceiptData): string {
		return markerPair(this.context, markerId(this.context, 'unsafe-html'), () => {
			const html = renderUnsafeHtmlValue(this.context, data.value);
			this.context.outputSink?.account(html);
			return html;
		});
	}

	/** Serializes a client-island publication boundary. */
	[exactServerBoundaryOperation](operation: object, data: ExactServerBoundaryReceiptData): string {
		this.context.outputSink?.invalidateAccounting();
		return renderServerBoundary(this.context, data, isFiniteClientBoundary(operation));
	}

	/** Serializes a retained server-owned child slot. */
	[exactServerSlotOperation](_operation: object, data: ExactServerSlotReceiptData): string {
		this.context.outputSink?.invalidateAccounting();
		return data.children.length
			? `${serverSlotOpening(serverSlotReceiptReference(data), this.context)}${this.renderChildList(this.context, data.children, this.parent, this.hasComponentAncestor)}</span>`
			: '';
	}

	/** Serializes portal children in logical ownership order. */
	[exactPortalOperation](_operation: object, data: ExactPortalReceiptData): string {
		this.context.outputSink?.invalidateAccounting();
		return this.renderChildList(
			this.context,
			data.children,
			this.parent,
			this.hasComponentAncestor
		);
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
			this.renderChildList,
			withoutRenderProgramReceiptEnhancement(operation)
		);
	}

	/** Serializes a compiler-issued direct server program nested inside another operation. */
	renderPreparedServerProgram(
		program: NonNullable<ReturnType<typeof readPreparedServerRenderProgram>>
	): string {
		return renderPreparedSsrProgramString(this.context, program, this.parent, this);
	}

	/** Serializes one direct server reference reached outside a prepared render-program segment. */
	renderDirectServerComponent(component: ServerComponentReference): string {
		this.context.enhancementOperationComponentDepth =
			(this.context.enhancementOperationComponentDepth ?? 0) + 1;
		try {
			return this.renderComponentReceipt(component, this.parent, this.hasComponentAncestor);
		} finally {
			this.context.enhancementOperationComponentDepth!--;
		}
	}

	/** Serializes a compiler-proven root without its redundant outer component delimiter. */
	renderCompilerClosedRootComponent(component: ServerComponentReference): string {
		return this.renderComponentReceipt(component, undefined, false, false, true);
	}

	/** Returns already serialized SSR output without reparsing it. */
	[exactSerializedSsrHtmlOperation](html: string): string {
		this.context.outputSink?.account(html);
		return html;
	}

	/** Crosses one child component boundary while ownership remains explicit in its arguments. */
	renderComponent(
		_context: SsrContext,
		component: ExactComponentReceiptData,
		parent?: AnyComponentInstance,
		hasComponentAncestor = false,
		omitCompilerOwnedBoundary = false
	): string {
		return this.renderComponentReceipt(
			component,
			parent,
			hasComponentAncestor,
			omitCompilerOwnedBoundary
		);
	}

	/** Crosses one statically selected child boundary without a prepared reference allocation. */
	renderDirectComponent(
		_context: SsrContext,
		component: AnyExactComponentCallable,
		props: Record<string, unknown> | null,
		parent?: AnyComponentInstance,
		hasComponentAncestor = false,
		omitCompilerOwnedBoundary = false
	): string {
		return this.renderDirectComponentReceipt(
			component,
			props,
			parent,
			hasComponentAncestor,
			omitCompilerOwnedBoundary
		);
	}

	private renderComponentReceipt(
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
			this,
			omitCompilerOwnedBoundary,
			omitRootBoundary
		);
	}

	private renderDirectComponentReceipt(
		component: AnyExactComponentCallable,
		props: Record<string, unknown> | null,
		parent: AnyComponentInstance | undefined,
		hasComponentAncestor: boolean,
		omitCompilerOwnedBoundary = false
	): string {
		return renderSyncDirectComponent(
			this.context,
			component,
			props,
			parent,
			hasComponentAncestor,
			this,
			omitCompilerOwnedBoundary
		);
	}
}
