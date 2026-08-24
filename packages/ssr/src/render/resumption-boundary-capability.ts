import type { VNode } from '@exactjs/core';
import { markerPair } from '../markup.js';
import type { SsrContext } from '../types.js';
import { realmSsrCapabilities } from './realm-capability.js';

type ResumptionBoundaryCapability = (
	context: SsrContext,
	vnode: VNode,
	id: string,
	html: string,
	props: Record<string, unknown>
) => string;

const capabilityName = 'resumption-boundary';

/** Installs resumption publication only for compiler artifacts that require it. */
export function registerResumptionBoundaryCapability(next: ResumptionBoundaryCapability): void {
	realmSsrCapabilities[capabilityName] = next;
}

/** Wraps a component in resumption metadata only when that capability was installed. */
export function renderResumableComponentBoundary(
	context: SsrContext,
	vnode: VNode,
	id: string,
	html: string,
	props: Record<string, unknown>
): string {
	const capability = realmSsrCapabilities[capabilityName] as
		| ResumptionBoundaryCapability
		| undefined;
	return capability?.(context, vnode, id, html, props) ?? markerPair(context, id, () => html);
}
