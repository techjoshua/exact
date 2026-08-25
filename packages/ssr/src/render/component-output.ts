import type { VNode } from '@exactjs/core';
import { readPreparedExactCompiledComponentContract } from '@exactjs/core/framework/component-contracts';
import { markerPair } from '../markup.js';
import type { SsrContext } from '../types.js';
import { renderPreparedResumableComponentBoundary } from './resumption-boundary-capability.js';

/** Wraps completed component HTML in the compiler-selected root or resumption boundary. */
export function componentHtml(
	context: SsrContext,
	vnode: VNode,
	componentId: string,
	html: string,
	props: Record<string, unknown>,
	flags: {
		enhancement: boolean;
		documentProbe: boolean;
		hasComponentAncestor: boolean;
		omitCompilerOwnedBoundary?: boolean;
	}
): string {
	const publication =
		typeof vnode.type === 'function'
			? readPreparedExactCompiledComponentContract(vnode.type).definition.server?.publication
			: undefined;
	const resumable = publication?.kind === 'resumption';
	return flags.enhancement ||
		(flags.documentProbe && context.documentRootSeen) ||
		(flags.omitCompilerOwnedBoundary && !resumable)
		? html
		: flags.hasComponentAncestor
			? resumable
				? renderPreparedResumableComponentBoundary(
						context,
						componentId,
						publication.name,
						html,
						props
					)
				: markerPair(context, componentId, () => html)
			: markerPair(context, componentId, () => html);
}
