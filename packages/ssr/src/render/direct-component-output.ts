import type { ExactServerComponentExecutionContract } from '@exactjs/core/framework/component-contracts';
import { markerPair } from '../markup.js';
import type { SsrContext } from '../types.js';
import { renderPreparedResumableComponentBoundary } from './resumption-boundary-capability.js';

/** Publishes a direct component from compiler-projected server facts only. */
export function directComponentHtml(
	context: SsrContext,
	componentId: string,
	html: string,
	props: Record<string, unknown>,
	publication: ExactServerComponentExecutionContract['publication'],
	flags: {
		enhancement: boolean;
		documentProbe: boolean;
		hasComponentAncestor: boolean;
		omitCompilerOwnedBoundary?: boolean;
	}
): string {
	const resumable = publication?.kind === 'resumption';
	if (
		flags.enhancement ||
		(flags.documentProbe && context.documentRootSeen) ||
		(flags.omitCompilerOwnedBoundary && !resumable)
	)
		return html;
	if (!flags.hasComponentAncestor || !resumable)
		return markerPair(context, componentId, () => html);
	return renderPreparedResumableComponentBoundary(
		context,
		componentId,
		publication.name,
		html,
		props
	);
}
