import { readPreparedServerRenderProgram } from '@exactjs/core/framework/server-render-structure';
import {
	createCompiledIntrinsicReceipt,
	readCompiledIntrinsicReceipt,
	type ExactIntrinsicReceiptData
} from '@exactjs/core/runtime/component-abi';
import { unwrap } from '@exactjs/reactive/framework/values';
import { voidElements } from '../html.js';
import { renderAttrs } from '../markup.js';
import type { AnyComponentInstance, Child, SsrContext } from '../types.js';
import type { RenderValue } from './execution.js';
import { mapRenderValue, withRenderCleanup } from './execution.js';
import { enterHostTag, leaveHost, primitiveText } from './host.js';
import { consumeTargetReceiptLayers } from './receipt-target-contributions.js';
import { captureSsrProgramOutput } from './program-capture.js';

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

/** Serializes an intrinsic while retaining host ownership through pending descendants. */
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
	) => RenderValue<string>
): RenderValue<string> {
	if (context.writerSink)
		return captureSsrProgramOutput(context, () =>
			renderIntrinsicReceipt(context, receipt, parent, hasComponentAncestor, renderChildren)
		);
	const host = enterHostTag(context, receipt.tag);
	const tag = host.tag;
	return withRenderCleanup(
		() => {
			const hostProps = intrinsicHostProps(context, receipt);
			const attrs = renderAttrs(
				consumeTargetReceiptLayers(context, hostProps),
				false,
				tag,
				context
			);
			if (voidElements.has(tag)) return `${host.prefix}<${tag}${attrs}>`;
			let content: RenderValue<string>;
			if (tag === 'script' || tag === 'style') content = primitiveText(receipt.children);
			else {
				const previousSelect = context.selectValue;
				if (tag === 'select')
					context.selectValue = unwrap(receipt.props.value ?? receipt.props.defaultValue);
				content = withRenderCleanup(
					() =>
						renderChildren(
							context,
							tag === 'html' ? normalizeDocumentChildren(receipt.children) : receipt.children,
							parent,
							hasComponentAncestor
						),
					() => {
						context.selectValue = previousSelect;
					}
				);
			}
			return mapRenderValue(content, (html) => `${host.prefix}<${tag}${attrs}>${html}</${tag}>`);
		},
		() => leaveHost(context, tag)
	);
}

/** Normalizes a compiler-issued document operation tree without reconstructing topology. */
function normalizeDocumentChildren(children: readonly Child[]): readonly Child[] {
	if (
		children.length === 2 &&
		documentChildTag(children[0]) === 'head' &&
		documentChildTag(children[1]) === 'body'
	)
		return children;
	const classified = children.map((child) => ({
		child,
		tag: documentChildTag(child)
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

/** Recognizes document hosts across generic operations and compiler-owned server programs. */
function documentChildTag(child: Child): string | undefined {
	const program = readPreparedServerRenderProgram(child);
	// An ordinary program is known intrinsic content even when it is not a document host.
	return program ? (program.program.ssrHost ?? '') : readCompiledIntrinsicReceipt(child)?.tag;
}
