import { markerPair } from '../markup.js';
import type { SsrContext } from '../types.js';
import { ssrCapabilities } from './capability-registry.js';

type ResumptionBoundaryCapability = (
	context: SsrContext,
	id: string,
	name: string,
	html: string,
	props: Record<string, unknown>
) => string;

const capabilityName = 'resumption-boundary';

/** Installs resumption publication only for compiler artifacts that require it. */
export function registerResumptionBoundaryCapability(next: ResumptionBoundaryCapability): void {
	ssrCapabilities[capabilityName] = next;
}

/** Wraps a compiler-proven resumable component without reading its contract again. */
export function renderPreparedResumableComponentBoundary(
	context: SsrContext,
	id: string,
	name: string,
	html: string,
	props: Record<string, unknown>
): string {
	const capability = ssrCapabilities[capabilityName] as ResumptionBoundaryCapability | undefined;
	return capability?.(context, id, name, html, props) ?? markerPair(context, id, () => html);
}
