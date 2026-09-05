import type { ExactServerComponentExecution } from '@exactjs/core/framework/component-contracts';
import { finalizedMarkerPair } from '../markers.js';
import type { SsrContext } from '../types.js';
import { renderPreparedResumableComponentBoundary } from './resumption-boundary-capability.js';

/** Publishes a direct component from compiler-projected server facts only. */
export function directComponentHtml(
	context: SsrContext,
	componentId: string,
	html: string,
	props: Record<string, unknown>,
	publication: ExactServerComponentExecution['publication'],
	enhancement: boolean,
	documentProbe: boolean,
	hasComponentAncestor: boolean,
	omitCompilerOwnedBoundary = false,
	omitRootBoundary = false
): string {
	const resumable = publication?.kind === 'resumption';
	if (
		enhancement ||
		(documentProbe && context.documentRootSeen) ||
		omitRootBoundary ||
		(omitCompilerOwnedBoundary && !resumable)
	)
		return html;
	if (!hasComponentAncestor || !resumable) return finalizedMarkerPair(context, componentId, html);
	return renderPreparedResumableComponentBoundary(
		context,
		componentId,
		publication.name,
		html,
		props
	);
}
