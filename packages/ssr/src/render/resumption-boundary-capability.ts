import type { VNode } from '@exactjs/core';
import { readPreparedExactCompiledComponentContract } from '@exactjs/core/framework/component-contracts';
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

/** Wraps a component in resumption metadata only when that capability was installed. */
export function renderResumableComponentBoundary(
	context: SsrContext,
	vnode: VNode,
	id: string,
	html: string,
	props: Record<string, unknown>
): string {
	const publication =
		typeof vnode.type === 'function'
			? readPreparedExactCompiledComponentContract(vnode.type).definition.server?.publication
			: undefined;
	if (publication?.kind !== 'resumption') return markerPair(context, id, () => html);
	return renderPreparedResumableComponentBoundary(context, id, publication.name, html, props);
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
