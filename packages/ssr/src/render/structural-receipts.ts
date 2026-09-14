import { normalizeActivityMode, unwrap, type AnyComponentInstance } from '@exactjs/core';
import type {
	ExactActivityReceiptData,
	ExactFragmentReceiptData,
	ExactKeyedChildReceiptData,
	ExactSuspenseReceiptData,
	ExactTargetReceiptData
} from '@exactjs/core/runtime/component-abi';
import { markerId, markerPair, suspenseStatusMarkerId } from '../markup.js';
import type { RenderToStringOptions, SsrContext } from '../types.js';
import type { RenderValue } from './execution.js';
import { renderNativeSuspense } from './structural-boundary-capability.js';
import { captureSsrProgramOutput } from './program-capture.js';

/** Async keyed sibling serialization. */
export function renderKeyedChildReceipt(
	context: SsrContext,
	receipt: ExactKeyedChildReceiptData,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	hasComponentAncestor: boolean,
	renderChildren: (
		context: SsrContext,
		children: readonly import('@exactjs/core').Child[],
		parent: AnyComponentInstance | undefined,
		options: RenderToStringOptions,
		hasComponentAncestor: boolean
	) => RenderValue<string>
): RenderValue<string> {
	return markerPair(context, markerId(context, 'item', undefined, receipt.key), () =>
		renderChildren(
			context,
			[receipt.value as import('@exactjs/core').Child],
			parent,
			options,
			hasComponentAncestor
		)
	);
}

/** Serializes one compiler-owned transparent range asynchronously. */
export function renderFragmentReceipt(
	context: SsrContext,
	receipt: Pick<ExactFragmentReceiptData, 'children' | 'key'>,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	hasComponentAncestor: boolean,
	renderChildren: (
		context: SsrContext,
		children: readonly import('@exactjs/core').Child[],
		parent: AnyComponentInstance | undefined,
		options: RenderToStringOptions,
		hasComponentAncestor: boolean
	) => RenderValue<string>
): RenderValue<string> {
	return markerPair(context, markerId(context, 'fragment', undefined, receipt.key), () =>
		renderChildren(context, receipt.children, parent, options, hasComponentAncestor)
	);
}

/** Async semantic-target serialization with request-local contribution ownership. */
export async function renderTargetReceipt(
	context: SsrContext,
	receipt: ExactTargetReceiptData,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	hasComponentAncestor: boolean,
	renderChildren: (
		context: SsrContext,
		children: readonly import('@exactjs/core').Child[],
		parent: AnyComponentInstance | undefined,
		options: RenderToStringOptions,
		hasComponentAncestor: boolean
	) => RenderValue<string>
): Promise<string> {
	const layer = { props: receipt.props, consumed: false };
	(context.targetReceiptLayers ??= []).push(layer);
	try {
		return await markerPair(context, markerId(context, 'target', undefined, receipt.key), () =>
			renderChildren(context, receipt.children, parent, options, hasComponentAncestor)
		);
	} finally {
		context.targetReceiptLayers!.pop();
	}
}

/** Serializes one compiler-issued retained Activity operation asynchronously. */
export function renderActivityReceipt(
	context: SsrContext,
	receipt: ExactActivityReceiptData,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	hasComponentAncestor: boolean,
	renderChildren: (
		context: SsrContext,
		children: readonly import('@exactjs/core').Child[],
		parent: AnyComponentInstance | undefined,
		options: RenderToStringOptions,
		hasComponentAncestor: boolean
	) => RenderValue<string>
): RenderValue<string> {
	return markerPair(context, markerId(context, 'activity'), () =>
		normalizeActivityMode(unwrap(receipt.props.mode)) === 'active'
			? renderChildren(context, receipt.children, parent, options, hasComponentAncestor)
			: Promise.resolve('')
	);
}

/** Serializes one compiler-issued readiness operation asynchronously. */
export async function renderSuspenseReceipt(
	context: SsrContext,
	receipt: ExactSuspenseReceiptData,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	hasComponentAncestor: boolean,
	renderChildren: (
		context: SsrContext,
		children: readonly import('@exactjs/core').Child[],
		parent: AnyComponentInstance | undefined,
		options: RenderToStringOptions,
		hasComponentAncestor: boolean
	) => RenderValue<string>
): Promise<string> {
	if (context.writerSink)
		return captureSsrProgramOutput(context, () =>
			renderSuspenseReceipt(context, receipt, parent, options, hasComponentAncestor, renderChildren)
		);
	const identity = markerId(context, 'suspense');
	const rendered = await renderNativeSuspense(
		context,
		receipt,
		parent,
		options,
		(target, children, owner, renderOptions) =>
			renderChildren(target, children, owner, renderOptions, hasComponentAncestor)
	);
	return markerPair(
		context,
		suspenseStatusMarkerId(identity, rendered.status),
		() => rendered.html
	);
}
