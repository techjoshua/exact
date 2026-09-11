import type { ExactServerComponentExecution } from '@exactjs/core/framework/component-contracts';
import { finalizedMarkerPair, formatMarkerId } from '../markers.js';
import type { SsrContext } from '../types.js';
import { renderPreparedResumableComponentBoundary } from './resumption-boundary-capability.js';

/** Captures pre-selection identity and boundary ownership before descendants reserve their IDs. */
export type ComponentPublication = Readonly<{
	/** Capture availability belongs to this execution scope, not the shared output context. */
	capturesResumptions: boolean;
	componentName: string;
	componentKey?: string;
	componentOrdinal: number;
	documentProbe: boolean;
	hasComponentAncestor: boolean;
	omitCompilerOwnedBoundary?: boolean;
	omitRootBoundary?: boolean;
}>;

/** Publishes a direct component from compiler-projected server facts only. */
export function directComponentHtml(
	context: SsrContext,
	html: string,
	props: Record<string, unknown>,
	publication: ExactServerComponentExecution['publication'],
	boundary: ComponentPublication
): string {
	const resumable = publication?.kind === 'resumption';
	if (
		(boundary.documentProbe && context.documentRootSeen) ||
		boundary.omitRootBoundary ||
		// A hydratable root already publishes this child's state in its ordered capture.
		(boundary.omitCompilerOwnedBoundary && (!resumable || boundary.capturesResumptions))
	)
		return html;
	const needsResumption =
		boundary.hasComponentAncestor && resumable && !boundary.capturesResumptions;
	if (!needsResumption && !context.markers) return html;
	const componentId = formatMarkerId(
		'component',
		boundary.componentOrdinal,
		boundary.componentName,
		boundary.componentKey
	);
	if (!needsResumption) return finalizedMarkerPair(context, componentId, html);
	return renderPreparedResumableComponentBoundary(
		context,
		componentId,
		publication.name,
		html,
		props
	);
}
