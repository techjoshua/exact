import type {
	ExactRenderProgram,
	ExactRenderProgramSsrAttribute
} from '@exactjs/core/framework/render-structure';
import {
	renderAttrs,
	renderCompiledNativeAttribute,
	renderCompiledNativeAttributes
} from '../markup.js';
import type { SsrContext } from '../types.js';
import { consumeTargetReceiptLayers } from './receipt-target-contributions.js';

/** Renders captured root attributes, reconstructing scalar inputs only for target composition. */
export function renderSsrRootAttributes(
	context: SsrContext,
	value: unknown,
	tag: string,
	staticAttributes?: ExactRenderProgram['ssrRootStatic'],
	accounted = false
): string {
	if (staticAttributes?.[3]) {
		const layers = context.targetReceiptLayers;
		if (!layers?.some((layer) => !layer.consumed)) {
			const prefix = staticAttributes[0];
			if (accounted) context.outputSink?.account(prefix);
			const attribute = staticAttributes[2]![0]!;
			return (
				prefix +
				renderCompiledNativeAttribute(
					value,
					attribute[0],
					attribute[1],
					attribute[2],
					tag,
					context,
					accounted
				)
			);
		}
		value = staticAttributes[3](value);
	}
	const props = value !== null && typeof value === 'object' ? value : {};
	const effective = consumeTargetReceiptLayers(context, props as Record<string, unknown>);
	if (effective === props && staticAttributes?.[2]) {
		const prefix = staticAttributes[0] ?? '';
		if (accounted) context.outputSink?.account(prefix);
		return `${prefix}${renderCompiledNativeAttributes(
			props as Record<string, unknown>,
			staticAttributes[2],
			tag,
			context,
			accounted
		)}`;
	}
	const html = renderAttrs(
		effective as Record<string, unknown>,
		false,
		tag,
		context,
		effective === props ? staticAttributes?.[1] : undefined
	);
	const rendered = effective === props ? `${staticAttributes?.[0] ?? ''}${html}` : html;
	if (accounted) context.outputSink?.account(rendered);
	return rendered;
}

/** Type alias kept local to the target method signatures that consume compiler-selected kinds. */
export type SsrAttributeKind = ExactRenderProgramSsrAttribute[0];
