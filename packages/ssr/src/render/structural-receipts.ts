import { normalizeActivityMode, unwrap, type AnyComponentInstance } from '@exactjs/core';
import type {
	ExactActivityReceiptData,
	ExactFragmentReceiptData,
	ExactKeyedChildReceiptData,
	ExactSuspenseReceiptData,
	ExactTargetReceiptData
} from '@exactjs/core/runtime/component-abi';
import type { RenderToStringOptions, SsrContext } from '../types.js';
import { markerId, markerPair, suspenseStatusMarkerId } from '../markup.js';
import {
	renderNativeSuspenseAsync,
	renderNativeSuspenseSync
} from './structural-boundary-capability.js';

/** Serializes one compiler-keyed sibling as an identity-owned range. */
export function renderKeyedChildReceipt(
	context: SsrContext,
	receipt: ExactKeyedChildReceiptData,
	parent: AnyComponentInstance | undefined,
	hasComponentAncestor: boolean,
	renderChildren: (
		context: SsrContext,
		children: readonly import('@exactjs/core').Child[],
		parent: AnyComponentInstance | undefined,
		hasComponentAncestor: boolean
	) => string
): string {
	return markerPair(context, markerId(context, 'item', undefined, receipt.key), () =>
		renderChildren(
			context,
			[receipt.value as import('@exactjs/core').Child],
			parent,
			hasComponentAncestor
		)
	);
}

/** Async keyed sibling serialization. */
export function renderKeyedChildReceiptAsync(
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
	) => Promise<string>
): Promise<string> {
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

/** Serializes one compiler-owned transparent range. */
export function renderFragmentReceipt(
	context: SsrContext,
	receipt: ExactFragmentReceiptData,
	parent: AnyComponentInstance | undefined,
	hasComponentAncestor: boolean,
	renderChildren: (
		context: SsrContext,
		children: readonly import('@exactjs/core').Child[],
		parent: AnyComponentInstance | undefined,
		hasComponentAncestor: boolean
	) => string
): string {
	return markerPair(context, markerId(context, 'fragment', undefined, receipt.key), () =>
		renderChildren(context, receipt.children, parent, hasComponentAncestor)
	);
}

/** Serializes one compiler-owned transparent range asynchronously. */
export function renderFragmentReceiptAsync(
	context: SsrContext,
	receipt: ExactFragmentReceiptData,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	hasComponentAncestor: boolean,
	renderChildren: (
		context: SsrContext,
		children: readonly import('@exactjs/core').Child[],
		parent: AnyComponentInstance | undefined,
		options: RenderToStringOptions,
		hasComponentAncestor: boolean
	) => Promise<string>
): Promise<string> {
	return markerPair(context, markerId(context, 'fragment', undefined, receipt.key), () =>
		renderChildren(context, receipt.children, parent, options, hasComponentAncestor)
	);
}

/** Serializes one semantic-target range while keeping its child contribution opaque. */
export function renderTargetReceipt(
	context: SsrContext,
	receipt: ExactTargetReceiptData,
	parent: AnyComponentInstance | undefined,
	hasComponentAncestor: boolean,
	renderChildren: (
		context: SsrContext,
		children: readonly import('@exactjs/core').Child[],
		parent: AnyComponentInstance | undefined,
		hasComponentAncestor: boolean
	) => string
): string {
	const layer = { props: receipt.props, consumed: false };
	(context.targetReceiptLayers ??= []).push(layer);
	try {
		return markerPair(context, markerId(context, 'target', undefined, receipt.key), () =>
			renderChildren(context, receipt.children, parent, hasComponentAncestor)
		);
	} finally {
		context.targetReceiptLayers!.pop();
	}
}

/** Async semantic-target serialization with request-local contribution ownership. */
export async function renderTargetReceiptAsync(
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
	) => Promise<string>
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

/** Serializes one compiler-issued retained Activity operation. */
export function renderActivityReceipt(
	context: SsrContext,
	receipt: ExactActivityReceiptData,
	parent: AnyComponentInstance | undefined,
	hasComponentAncestor: boolean,
	renderChildren: (
		context: SsrContext,
		children: readonly import('@exactjs/core').Child[],
		parent: AnyComponentInstance | undefined,
		hasComponentAncestor: boolean
	) => string
): string {
	return markerPair(context, markerId(context, 'activity'), () =>
		normalizeActivityMode(unwrap(receipt.props.mode)) === 'active'
			? renderChildren(context, receipt.children, parent, hasComponentAncestor)
			: ''
	);
}

/** Serializes one compiler-issued retained Activity operation asynchronously. */
export function renderActivityReceiptAsync(
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
	) => Promise<string>
): Promise<string> {
	return markerPair(context, markerId(context, 'activity'), () =>
		normalizeActivityMode(unwrap(receipt.props.mode)) === 'active'
			? renderChildren(context, receipt.children, parent, options, hasComponentAncestor)
			: Promise.resolve('')
	);
}

/** Serializes one compiler-issued readiness operation synchronously. */
export function renderSuspenseReceipt(
	context: SsrContext,
	receipt: ExactSuspenseReceiptData,
	parent: AnyComponentInstance | undefined,
	hasComponentAncestor: boolean,
	renderChildren: (
		context: SsrContext,
		children: readonly import('@exactjs/core').Child[],
		parent: AnyComponentInstance | undefined,
		hasComponentAncestor: boolean
	) => string
): string {
	const identity = markerId(context, 'suspense');
	const rendered = renderNativeSuspenseSync(context, receipt, parent, (target, children, owner) =>
		renderChildren(target, children, owner, hasComponentAncestor)
	);
	return markerPair(
		context,
		suspenseStatusMarkerId(identity, rendered.status),
		() => rendered.html
	);
}

/** Serializes one compiler-issued readiness operation asynchronously. */
export async function renderSuspenseReceiptAsync(
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
	) => Promise<string>
): Promise<string> {
	const identity = markerId(context, 'suspense');
	const rendered = await renderNativeSuspenseAsync(
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
