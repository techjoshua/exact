import type {
	ExactRenderProgram,
	ExactRenderProgramSsrAttribute
} from '@exactjs/core/framework/render-structure';
import { renderAttrs, renderCompiledNativeAttributes } from '../markup.js';
import type { SsrContext } from '../types.js';
import { consumeTargetReceiptLayers } from './receipt-target-contributions.js';

/** Renders a root prop bag through its closed plan or the target-composition fallback. */
export function renderSsrRootAttributes(
	context: SsrContext,
	value: unknown,
	tag: string,
	staticAttributes?: ExactRenderProgram['ssrRootStatic']
): string {
	const props = value !== null && typeof value === 'object' ? value : {};
	const effective = consumeTargetReceiptLayers(context, props as Record<string, unknown>);
	const html =
		effective === props && staticAttributes?.[2]
			? renderCompiledNativeAttributes(
					props as Record<string, unknown>,
					staticAttributes[2],
					tag,
					context
				)
			: renderAttrs(
					effective as Record<string, unknown>,
					false,
					tag,
					context,
					effective === props ? staticAttributes?.[1] : undefined
				);
	return effective === props ? `${staticAttributes?.[0] ?? ''}${html}` : html;
}

/** Type alias kept local to the target method signatures that consume compiler-selected kinds. */
export type SsrAttributeKind = ExactRenderProgramSsrAttribute[0];
