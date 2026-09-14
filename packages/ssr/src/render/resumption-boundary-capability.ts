import { finalizedMarkerPair } from '../markers.js';
import type { SsrContext } from '../types.js';
import { ssrCapabilities } from './capability-registry.js';
import type { SsrSerializedResumption } from '../resumption.js';

type ResumptionBoundaryCapability = (
	context: SsrContext,
	id: string,
	name: string,
	html: string,
	props: Record<string, unknown>,
	resumptions?: readonly SsrSerializedResumption[]
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
	props: Record<string, unknown>,
	resumptions?: readonly SsrSerializedResumption[]
): string {
	const capability = ssrCapabilities[capabilityName] as ResumptionBoundaryCapability | undefined;
	return (
		capability?.(context, id, name, html, props, resumptions) ??
		finalizedMarkerPair(context, id, html)
	);
}
