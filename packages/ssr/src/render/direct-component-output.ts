import type { ExactServerComponentExecution } from '@exactjs/core/framework/component-contracts';
import { finalizedMarkerPair, formatMarkerId } from '../markers.js';
import type { SsrContext } from '../types.js';
import { renderPreparedResumableComponentBoundary } from './resumption-boundary-capability.js';
import { needsIndependentResumption } from './component-publication-policy.js';

/** Captures pre-selection identity and boundary ownership before descendants reserve their IDs. */
export type ComponentPublication = Readonly<{
	/** Capture availability belongs to this execution scope, not the shared output context. */
	capturesResumptions: boolean;
	/** A surrounding client owner adopts this output instead of publishing another island. */
	clientResumptionOwner: boolean;
	/** Renderer-selected enhancements activate through the target that owns their attachment. */
	rendererEnhancement?: boolean;
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
		!boundary.capturesResumptions &&
		needsIndependentResumption(
			publication,
			boundary.hasComponentAncestor,
			boundary.clientResumptionOwner,
			boundary.rendererEnhancement
		);
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
