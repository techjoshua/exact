import { unwrap } from '@exactjs/reactive/framework/values';
import {
	createCompiledIntrinsicReceipt,
	readCompiledIntrinsicReceipt,
	type ExactIntrinsicReceiptData
} from '@exactjs/core/runtime/component-abi';
import { voidElements } from '../html.js';
import { renderAttrs } from '../markup.js';
import type { AnyComponentInstance, Child, SsrContext } from '../types.js';
import { enterHostTag, leaveHost, primitiveText } from './host.js';
import { consumeTargetReceiptLayers } from './receipt-target-contributions.js';

/** Serializes one direct intrinsic receipt with caller-owned child traversal. */
export function renderIntrinsicReceipt(
	context: SsrContext,
	receipt: ExactIntrinsicReceiptData,
	parent: AnyComponentInstance | undefined,
	hasComponentAncestor: boolean,
	renderChildren: (
		context: SsrContext,
		children: readonly Child[],
		parent: AnyComponentInstance | undefined,
		hasComponentAncestor: boolean
	) => string
): string {
	const host = enterHostTag(context, receipt.tag);
	const tag = host.tag;
	try {
		const hostProps = intrinsicHostProps(context, receipt);
		const attrs = renderAttrs(consumeTargetReceiptLayers(context, hostProps), false, tag, context);
		if (voidElements.has(tag)) return `${host.prefix}<${tag}${attrs}>`;
		let content: string;
		if (tag === 'script' || tag === 'style') content = primitiveText(receipt.children);
		else {
			const previousSelect = context.selectValue;
			if (tag === 'select')
				context.selectValue = unwrap(receipt.props.value ?? receipt.props.defaultValue);
			try {
				content = renderChildren(
					context,
					tag === 'html' ? normalizeDocumentChildren(receipt.children) : receipt.children,
					parent,
					hasComponentAncestor
				);
			} finally {
				context.selectValue = previousSelect;
			}
		}
		return `${host.prefix}<${tag}${attrs}>${content}</${tag}>`;
	} finally {
		leaveHost(context, tag);
	}
}

function intrinsicHostProps(
	context: SsrContext,
	receipt: ExactIntrinsicReceiptData
): Readonly<Record<string, unknown>> {
	if (receipt.tag !== 'option' || context.selectValue === undefined) return receipt.props;
	const value = String(unwrap(receipt.props.value) ?? primitiveText(receipt.children));
	const selected = Array.isArray(context.selectValue)
		? context.selectValue.some((item) => String(unwrap(item)) === value)
		: String(unwrap(context.selectValue)) === value;
	return { ...receipt.props, selected };
}

/** Async counterpart preserving the same host-stack ownership. */
export async function renderIntrinsicReceiptAsync(
	context: SsrContext,
	receipt: ExactIntrinsicReceiptData,
	parent: AnyComponentInstance | undefined,
	hasComponentAncestor: boolean,
	renderChildren: (
		context: SsrContext,
		children: readonly Child[],
		parent: AnyComponentInstance | undefined,
		hasComponentAncestor: boolean
	) => Promise<string>
): Promise<string> {
	const host = enterHostTag(context, receipt.tag);
	const tag = host.tag;
	try {
		const hostProps = intrinsicHostProps(context, receipt);
		const attrs = renderAttrs(consumeTargetReceiptLayers(context, hostProps), false, tag, context);
		if (voidElements.has(tag)) return `${host.prefix}<${tag}${attrs}>`;
		let content: string;
		if (tag === 'script' || tag === 'style') content = primitiveText(receipt.children);
		else {
			const previousSelect = context.selectValue;
			if (tag === 'select')
				context.selectValue = unwrap(receipt.props.value ?? receipt.props.defaultValue);
			try {
				content = await renderChildren(
					context,
					tag === 'html' ? normalizeDocumentChildren(receipt.children) : receipt.children,
					parent,
					hasComponentAncestor
				);
			} finally {
				context.selectValue = previousSelect;
			}
		}
		return `${host.prefix}<${tag}${attrs}>${content}</${tag}>`;
	} finally {
		leaveHost(context, tag);
	}
}

/** Normalizes a compiler-issued document operation tree without reconstructing topology. */
function normalizeDocumentChildren(children: readonly Child[]): readonly Child[] {
	const classified = children.map((child) => ({
		child,
		tag: readCompiledIntrinsicReceipt(child)?.tag
	}));
	if (classified.some((entry) => entry.tag === undefined)) return children;
	const heads = classified.filter((entry) => entry.tag === 'head');
	const bodies = classified.filter((entry) => entry.tag === 'body');
	if (heads.length > 1) throw new Error('A root document may contain at most one <head> element.');
	if (bodies.length > 1) throw new Error('A root document may contain at most one <body> element.');
	const loose = classified.filter((entry) => entry.tag !== 'head' && entry.tag !== 'body');
	if (bodies.length && loose.length)
		throw new Error(
			'A root document with an authored <body> cannot also contain ambiguous loose content.'
		);
	return [
		heads[0]?.child ?? createCompiledIntrinsicReceipt('head', null),
		bodies[0]?.child ??
			createCompiledIntrinsicReceipt('body', null, ...loose.map((entry) => entry.child))
	];
}
