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
import {
	readPreparedServerRenderProgram,
	type ExactPreparedServerChildRange,
	type ExactPreparedServerKeyedChild
} from '@exactjs/core/framework/server-render-structure';
import { unwrap } from '@exactjs/reactive/framework/values';
import type { Child, RenderToStringOptions, SsrContext } from '../types.js';
import { exactMarkerId, markerId, markerPair } from '../markup.js';
import { renderComponentReferenceAsync } from './component-async.js';
import { renderUnsafeHtmlValue } from './host.js';
import { renderIntrinsicReceiptAsync } from './intrinsic-receipt.js';
import { boundedJoin } from './limits.js';
import { renderPreparedSsrProgram } from './render-program.js';
import { prepareDirectScheduledSsrComponentReferences } from './direct-component-scheduling.js';
import { registerDynamicComponentPreload } from './resource-hints.js';
import { renderServerBoundaryAsync } from './server-boundary-capability.js';
import { serverSlotOpening, serverSlotReceiptReference } from './server-slots.js';
import {
	renderActivityReceiptAsync,
	renderFragmentReceiptAsync,
	renderKeyedChildReceiptAsync,
	renderSuspenseReceiptAsync,
	renderTargetReceiptAsync
} from './structural-receipts.js';
import type { ServerComponentReference } from './server-component-reference.js';
import {
	captureNestedEnhancementPrefix,
	renderOperationEnhancementsAsync
} from './operation-enhancements.js';
import { exactSerializedSsrHtmlOperation } from './serialized-html-operation.js';

type RenderChildrenAsync = (
	context: SsrContext,
	children: readonly Child[],
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	hasComponentAncestor?: boolean
) => Promise<string>;

/** Async SSR target selected directly by each opaque compiler-issued operation. */
export class AsyncSsrOperationTarget {
	constructor(
		private readonly context: SsrContext,
		private readonly parent: AnyComponentInstance | undefined,
		private readonly options: RenderToStringOptions,
		private readonly hasComponentAncestor: boolean,
		private readonly renderChildren: RenderChildrenAsync
	) {}

	/** Serializes a component operation with asynchronous descendant support. */
	async [exactComponentOperation](
		_operation: object,
		data: ExactComponentReceiptData
	): Promise<string> {
		this.context.enhancementOperationComponentDepth =
			(this.context.enhancementOperationComponentDepth ?? 0) + 1;
		try {
			return await renderComponentReferenceAsync(
				this.context,
				data,
				this.parent,
				this.options,
				this.hasComponentAncestor
			);
		} finally {
			this.context.enhancementOperationComponentDepth!--;
		}
	}

	/** Serializes an intrinsic operation and any enhancement wrapper. */
	[exactIntrinsicOperation](operation: object, data: ExactIntrinsicReceiptData): Promise<string> {
		return renderOperationEnhancementsAsync(
			this.context,
			data.enhancement,
			() =>
				renderIntrinsicReceiptAsync(
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
	async [exactKeyedChildOperation](
		_operation: object,
		data: ExactKeyedChildReceiptData
	): Promise<string> {
		return this.renderKeyedChild(data);
	}

	/** Serializes one direct compiler-closed keyed server child. */
	renderDirectServerKeyedChild(data: ExactPreparedServerKeyedChild): Promise<string> {
		return this.renderKeyedChild(data);
	}

	private async renderKeyedChild(
		data: ExactPreparedServerKeyedChild | ExactKeyedChildReceiptData
	): Promise<string> {
		const program = readPreparedServerRenderProgram(data.value);
		if (program)
			return markerPair(
				this.context,
				markerId(this.context, 'item', undefined, data.key),
				async () => {
					const planned = renderPreparedSsrProgram(this.context, program, this.parent);
					const output: string[] = [];
					for (const segment of planned.segments) {
						const rendered = await this.renderProgramSegment(segment);
						captureNestedEnhancementPrefix(this.context, output);
						if (rendered !== '') output.push(rendered);
					}
					return boundedJoin(this.context, output);
				}
			);
		return renderKeyedChildReceiptAsync(
			this.context,
			data as ExactKeyedChildReceiptData,
			this.parent,
			this.options,
			this.hasComponentAncestor,
			this.renderChildren
		);
	}

	/** Serializes an asynchronously settling Suspense operation. */
	[exactSuspenseOperation](operation: object, data: ExactSuspenseReceiptData): Promise<string> {
		return renderOperationEnhancementsAsync(
			this.context,
			data.enhancement,
			() =>
				renderSuspenseReceiptAsync(
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
	[exactActivityOperation](_operation: object, data: ExactActivityReceiptData): Promise<string> {
		return renderActivityReceiptAsync(
			this.context,
			data,
			this.parent,
			this.options,
			this.hasComponentAncestor,
			this.renderChildren
		);
	}

	/** Serializes a transparent compiler-owned fragment range. */
	[exactFragmentOperation](operation: object, data: ExactFragmentReceiptData): Promise<string> {
		return renderOperationEnhancementsAsync(
			this.context,
			data.enhancement,
			() =>
				renderFragmentReceiptAsync(
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
	[exactTargetOperation](_operation: object, data: ExactTargetReceiptData): Promise<string> {
		return renderTargetReceiptAsync(
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
		_operation: object,
		data: ExactChildRangeReceiptData
	): string | Promise<string> {
		if (data.dynamicComponent && data.markerId)
			registerDynamicComponentPreload(this.context, data.markerId);
		return this.renderChildRange(data, !!data.dynamicComponent);
	}

	/** Serializes one direct compiler-closed server child range. */
	renderDirectServerChildRange(data: ExactPreparedServerChildRange): string | Promise<string> {
		return this.renderChildRange(data, false);
	}

	private renderChildRange(
		data: ExactPreparedServerChildRange | ExactChildRangeReceiptData,
		dynamicComponent: boolean
	): string | Promise<string> {
		const children = dynamicComponent
			? []
			: normalizeRenderResult(unwrap(data.value) as Child | Child[]);
		const identity = data.markerId
			? `dynamic:${exactMarkerId(data.markerId)}`
			: markerId(this.context, 'dynamic');
		return markerPair(this.context, identity, () =>
			this.renderChildren(
				this.context,
				children,
				this.parent,
				this.options,
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
	[exactServerBoundaryOperation](
		operation: object,
		data: ExactServerBoundaryReceiptData
	): Promise<string> {
		return renderServerBoundaryAsync(
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
		return data.children.length
			? this.renderChildren(
					this.context,
					data.children,
					this.parent,
					this.options,
					this.hasComponentAncestor
				).then(
					(html) =>
						`${serverSlotOpening(serverSlotReceiptReference(data), this.context)}${html}</span>`
				)
			: '';
	}

	/** Serializes portal children in logical ownership order. */
	[exactPortalOperation](_operation: object, data: ExactPortalReceiptData): Promise<string> {
		return this.renderChildren(
			this.context,
			data.children,
			this.parent,
			this.options,
			this.hasComponentAncestor
		);
	}

	/** Serializes a compiler-closed server render program. */
	async [exactRenderProgramOperation](
		operation: object,
		data: ExactRenderProgramReceiptData
	): Promise<string> {
		const program = readPreparedServerRenderProgram(data.invocation);
		if (!program)
			throw new TypeError('Server rendering received a client-only render-program operation');
		return renderOperationEnhancementsAsync(
			this.context,
			data.enhancement,
			() => this.renderPreparedServerProgram(program),
			this.parent,
			this.options,
			this.renderChildren,
			withoutRenderProgramReceiptEnhancement(operation)
		);
	}

	/** Serializes a compiler-issued direct server program nested inside another operation. */
	async renderPreparedServerProgram(
		program: NonNullable<ReturnType<typeof readPreparedServerRenderProgram>>
	): Promise<string> {
		const planned = renderPreparedSsrProgram(this.context, program, this.parent);
		const references = planned.segments.filter(
			(segment): segment is ServerComponentReference =>
				typeof segment !== 'string' && !Array.isArray(segment)
		);
		const preparation = prepareDirectScheduledSsrComponentReferences(
			this.context,
			references,
			this.parent,
			this.options
		);
		const output: string[] = [];
		try {
			for (const segment of planned.segments) {
				const rendered = await this.renderProgramSegment(segment);
				captureNestedEnhancementPrefix(this.context, output);
				if (rendered !== '') output.push(rendered);
			}
		} finally {
			await preparation?.[Symbol.asyncDispose]();
		}
		return boundedJoin(this.context, output);
	}

	/** Serializes one direct server reference reached outside a prepared render-program segment. */
	async renderDirectServerComponent(component: ServerComponentReference): Promise<string> {
		this.context.enhancementOperationComponentDepth =
			(this.context.enhancementOperationComponentDepth ?? 0) + 1;
		try {
			return await renderComponentReferenceAsync(
				this.context,
				component,
				this.parent,
				this.options,
				this.hasComponentAncestor
			);
		} finally {
			this.context.enhancementOperationComponentDepth!--;
		}
	}

	/** Serializes a compiler-proven root without its redundant outer component delimiter. */
	renderCompilerClosedRootComponent(component: ServerComponentReference): Promise<string> {
		return renderComponentReferenceAsync(
			this.context,
			component,
			undefined,
			this.options,
			false,
			false,
			true
		);
	}

	/** Returns already serialized SSR output without reparsing it. */
	[exactSerializedSsrHtmlOperation](html: string): string {
		return html;
	}

	private renderProgramSegment(
		segment: string | readonly Child[] | ServerComponentReference
	): string | Promise<string> {
		if (typeof segment === 'string') return segment;
		if (Array.isArray(segment))
			return this.renderChildren(
				this.context,
				segment,
				this.parent,
				this.options,
				this.hasComponentAncestor
			);
		return renderComponentReferenceAsync(
			this.context,
			segment as ServerComponentReference,
			this.parent,
			this.options,
			this.hasComponentAncestor,
			true
		);
	}
}
