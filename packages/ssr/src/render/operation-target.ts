import { consumeSuppliedPlacement } from './supplied-placement.js';
import { readServerComponentReference } from './server-component-reference.js';
import { componentContractVersion } from '../component-contract-version.js';
import { assertComponentInputVersion } from '@exactjs/core/runtime/component-operations';
import { renderBoundChildRange } from './bound-child-range.js';
import { renderDocumentDoctype } from './document-doctype.js';
import { boundOperationEnhancement } from './bound-enhancement-targets.js';
import { isFiniteClientBoundary, type AnyComponentInstance } from '@exactjs/core';
import {
	readPreparedServerRenderProgram,
	type ExactPreparedServerChildRange,
	type ExactPreparedServerKeyedChild
} from '@exactjs/core/framework/server-render-structure';
import {
	exactActivityOperation,
	exactDocumentOutputOperation,
	exactDoctypeOperation,
	type DoctypeOptions,
	type DocumentOutputKind,
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
	withoutCompiledFragmentReceiptEnhancement,
	withoutCompiledIntrinsicReceiptEnhancement,
	withoutCompiledSuspenseReceiptEnhancement,
	type ExactActivityReceiptData,
	type ExactChildRangeReceiptData,
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
	withoutRenderProgramReceiptEnhancement,
	type ExactRenderProgramReceiptData
} from '@exactjs/core/runtime/render-operations';
import { markerId, markerPair } from '../markup.js';
import type { Child, RenderToStringOptions, SsrContext } from '../types.js';
import { renderComponentReference, renderProgramComponentSegment } from './component.js';
import { prepareDirectScheduledSsrComponentReferences } from './direct-component-scheduling.js';
import type { RenderValue } from './execution.js';
import { mapRenderValue, withRenderCleanup } from './execution.js';
import { renderUnsafeHtmlValue } from './host.js';
import { renderIntrinsicReceipt } from './intrinsic-receipt.js';
import { renderDocumentOutput } from './document-output.js';
import { renderOperationEnhancements } from './operation-enhancements.js';
import { captureSsrProgramOutput } from './program-capture.js';
import { renderBoundProgram } from './bound-program-output.js';
import { exactSerializedSsrHtmlOperation } from './serialized-html-operation.js';
import { renderServerBoundary } from './server-boundary-capability.js';
import type { ServerComponentReference } from './server-component-reference.js';
import type { ServerList } from './server-list.js';
import {
	serverSlotOpening,
	serverSlotReceiptReference,
	serverSlotRenderOptions
} from './server-slots.js';
import {
	renderActivityReceipt,
	renderFragmentReceipt,
	renderKeyedChildReceipt,
	renderSuspenseReceipt,
	renderTargetReceipt
} from './structural-receipts.js';

type RenderChildren = (
	context: SsrContext,
	children: readonly Child[],
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	hasComponentAncestor?: boolean
) => RenderValue<string>;

/** Shared SSR target selected directly by each opaque compiler-issued operation. */
export class SsrOperationTarget {
	constructor(
		private readonly context: SsrContext,
		private readonly parent: AnyComponentInstance | undefined,
		private readonly options: RenderToStringOptions,
		private readonly hasComponentAncestor: boolean,
		private readonly renderChildren: RenderChildren
	) {}

	/** Selects a subtree-local check view after one actual operation is consumed. */
	forActualChild(value: unknown): SsrOperationTarget {
		const options = consumeSuppliedPlacement(this.options, value);
		return options === this.options
			? this
			: new SsrOperationTarget(
					this.context,
					this.parent,
					options,
					this.hasComponentAncestor,
					this.renderChildren
				);
	}

	/** Publishes a request-owned document slot at its authored location. */
	[exactDocumentOutputOperation](kind: DocumentOutputKind): string {
		return renderDocumentOutput(this.context, this.options, kind);
	}

	/** Emits an authored declaration before the root without generating a second default declaration. */
	[exactDoctypeOperation](declaration: DoctypeOptions): string {
		return renderDocumentDoctype(this.context, declaration);
	}

	/** Serializes a component operation with asynchronous descendant support. */
	[exactComponentInputsOperationV6](operation: object): RenderValue<string> {
		const data = readServerComponentReference(operation)!;
		return this.renderDirectServerComponent(data);
	}

	/** Serializes an intrinsic operation and any enhancement wrapper. */
	[exactIntrinsicOperation](
		operation: object,
		data: ExactIntrinsicReceiptData
	): RenderValue<string> {
		return renderOperationEnhancements(
			this.context,
			boundOperationEnhancement(this.context, operation, data.enhancement),
			() =>
				renderIntrinsicReceipt(
					this.context,
					data,
					this.parent,
					this.hasComponentAncestor,
					(target, children, owner, ancestor) =>
						this.renderChildren(target, children, owner, this.options, ancestor)
				),
			this.parent,
			this.options,
			this.renderChildren,
			withoutCompiledIntrinsicReceiptEnhancement(operation)
		);
	}

	/** Serializes one keyed child while preserving its marker identity. */
	[exactKeyedChildOperation](
		_operation: object,
		data: ExactKeyedChildReceiptData
	): RenderValue<string> {
		return this.renderKeyedChild(data);
	}

	/** Serializes one direct compiler-closed keyed server child. */
	renderDirectServerKeyedChild(data: ExactPreparedServerKeyedChild): RenderValue<string> {
		return this.renderKeyedChild(data);
	}

	private renderKeyedChild(
		data: ExactPreparedServerKeyedChild | ExactKeyedChildReceiptData
	): RenderValue<string> {
		const program = readPreparedServerRenderProgram(data.value);
		// The compiled program's single intrinsic root already owns this keyed item's boundary.
		// External scripts compile only on the server; their client intrinsic still claims the key range.
		if (program && program.program.ssrHost !== 'script')
			return this.renderPreparedServerProgram(program);
		return renderKeyedChildReceipt(
			this.context,
			data as ExactKeyedChildReceiptData,
			this.parent,
			this.options,
			this.hasComponentAncestor,
			this.renderChildren
		);
	}

	/** Serializes an asynchronously settling Suspense operation. */
	[exactSuspenseOperation](operation: object, data: ExactSuspenseReceiptData): RenderValue<string> {
		return renderOperationEnhancements(
			this.context,
			boundOperationEnhancement(this.context, operation, data.enhancement),
			() =>
				renderSuspenseReceipt(
					this.context,
					data,
					this.parent,
					this.options,
					this.hasComponentAncestor,
					this.renderChildren
				),
			this.parent,
			this.options,
			this.renderChildren,
			withoutCompiledSuspenseReceiptEnhancement(operation)
		);
	}

	/** Serializes the currently selected Activity content. */
	[exactActivityOperation](
		_operation: object,
		data: ExactActivityReceiptData
	): RenderValue<string> {
		return renderActivityReceipt(
			this.context,
			data,
			this.parent,
			this.options,
			this.hasComponentAncestor,
			this.renderChildren
		);
	}

	/** Serializes a transparent compiler-owned fragment range. */
	[exactFragmentOperation](operation: object, data: ExactFragmentReceiptData): RenderValue<string> {
		return renderOperationEnhancements(
			this.context,
			boundOperationEnhancement(this.context, operation, data.enhancement),
			() =>
				renderFragmentReceipt(
					this.context,
					data,
					this.parent,
					this.options,
					this.hasComponentAncestor,
					this.renderChildren
				),
			this.parent,
			this.options,
			this.renderChildren,
			withoutCompiledFragmentReceiptEnhancement(operation)
		);
	}

	/** Serializes the children selected by a semantic target operation. */
	[exactTargetOperation](_operation: object, data: ExactTargetReceiptData): RenderValue<string> {
		return renderTargetReceipt(
			this.context,
			data,
			this.parent,
			this.options,
			this.hasComponentAncestor,
			this.renderChildren
		);
	}

	/** Serializes a focused dynamic child range. */
	[exactChildRangeOperation](
		operation: object,
		data: ExactChildRangeReceiptData
	): string | Promise<string> {
		return renderBoundChildRange(
			this.context,
			operation,
			data,
			this.parent,
			this.options,
			this.hasComponentAncestor,
			this.renderChildren
		);
	}

	/** Serializes a direct list through the same fragment markers and child ownership. */
	renderServerList(data: ServerList): RenderValue<string> {
		return renderFragmentReceipt(
			this.context,
			data,
			this.parent,
			this.options,
			this.hasComponentAncestor,
			this.renderChildren
		);
	}

	/** Serializes one direct compiler-closed server child range. */
	renderDirectServerChildRange(data: ExactPreparedServerChildRange): string | Promise<string> {
		return renderBoundChildRange(
			this.context,
			data,
			data,
			this.parent,
			this.options,
			this.hasComponentAncestor,
			this.renderChildren,
			true
		);
	}

	/** Serializes audited raw HTML without reparsing it. */
	[exactUnsafeHtmlOperation](
		_operation: object,
		data: ExactUnsafeHtmlReceiptData
	): RenderValue<string> {
		return markerPair(this.context, markerId(this.context, 'unsafe-html'), () =>
			renderUnsafeHtmlValue(this.context, data.value)
		);
	}

	/** Serializes a client-island publication boundary. */
	[exactServerBoundaryOperation](
		operation: object,
		data: ExactServerBoundaryReceiptData
	): RenderValue<string> {
		return renderServerBoundary(
			this.context,
			data,
			this.parent,
			this.options,
			isFiniteClientBoundary(operation)
		);
	}

	/** Serializes a retained server-owned child slot. */
	[exactServerSlotOperation](
		_operation: object,
		data: ExactServerSlotReceiptData
	): string | Promise<string> {
		if (this.context.writerSink)
			return captureSsrProgramOutput(this.context, () =>
				this[exactServerSlotOperation](_operation, data)
			);
		return data.children.length
			? mapRenderValue(
					this.renderChildren(
						this.context,
						data.children,
						this.parent,
						serverSlotRenderOptions(this.options),
						this.hasComponentAncestor
					),
					(html) =>
						`${serverSlotOpening(serverSlotReceiptReference(data), this.context)}${html}</span>`
				)
			: '';
	}

	/** Serializes portal children in logical ownership order. */
	[exactPortalOperation](_operation: object, data: ExactPortalReceiptData): RenderValue<string> {
		return this.renderChildren(
			this.context,
			data.children,
			this.parent,
			this.options,
			this.hasComponentAncestor
		);
	}

	/** Serializes a compiler-closed server render program. */
	[exactRenderProgramOperation](
		operation: object,
		data: ExactRenderProgramReceiptData
	): RenderValue<string> {
		const program = readPreparedServerRenderProgram(data.invocation);
		if (!program)
			throw new TypeError('Server rendering received a client-only render-program operation');
		return renderOperationEnhancements(
			this.context,
			boundOperationEnhancement(this.context, operation, data.enhancement),
			() => this.renderPreparedServerProgram(program),
			this.parent,
			this.options,
			this.renderChildren,
			withoutRenderProgramReceiptEnhancement(operation)
		);
	}

	/** Serializes a compiler-issued direct server program nested inside another operation. */
	renderPreparedServerProgram(
		program: NonNullable<ReturnType<typeof readPreparedServerRenderProgram>>
	): RenderValue<string> {
		return renderBoundProgram(
			this.context,
			program,
			this,
			this.parent,
			this.options,
			this.renderChildren
		);
	}

	/** Prepares program siblings through this traversal target's existing owner and options. */
	prepareProgramReferences(
		values: readonly unknown[],
		owner: import('./direct-component-contracts.js').DirectScheduledPreparationOwner
	): AsyncDisposable | undefined {
		return prepareDirectScheduledSsrComponentReferences(
			this.context,
			values as readonly ServerComponentReference[],
			this.parent,
			this.options,
			owner
		);
	}

	/** Serializes one direct server reference reached outside a prepared render-program segment. */
	renderDirectServerComponent(component: ServerComponentReference): RenderValue<string> {
		this.context.enhancementOperationComponentDepth =
			(this.context.enhancementOperationComponentDepth ?? 0) + 1;
		return withRenderCleanup(
			() =>
				renderComponentReference(
					this.context,
					component,
					this.parent,
					consumeSuppliedPlacement(this.options, component.source),
					this.hasComponentAncestor
				),
			() => {
				this.context.enhancementOperationComponentDepth!--;
			}
		);
	}

	/** Serializes a compiler-proven root without its redundant outer component delimiter. */
	renderCompilerClosedRootComponent(component: ServerComponentReference): RenderValue<string> {
		return renderComponentReference(
			this.context,
			component,
			undefined,
			consumeSuppliedPlacement(this.options, component.source),
			false,
			false,
			true
		);
	}

	/** Returns already serialized SSR output without reparsing it. */
	[exactSerializedSsrHtmlOperation](html: string): string {
		return html;
	}

	/** Renders a prepared program segment without allocating a forwarding callback. */
	renderProgramSegment(
		segment: unknown,
		occurrence?: ServerComponentReference
	): RenderValue<string> {
		return renderProgramComponentSegment(
			this.context,
			segment,
			this.parent,
			this.options,
			this.hasComponentAncestor,
			occurrence
		);
	}
}

// The private operation capability is required even by direct receipt-adoption lanes.
assertComponentInputVersion(componentContractVersion);
