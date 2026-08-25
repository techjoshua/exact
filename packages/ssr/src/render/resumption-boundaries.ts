import type { VNode } from '@exactjs/core';
import { readPreparedExactCompiledComponentContract } from '@exactjs/core/framework/component-contracts';
import { markerPair } from '../markup.js';
import type { SsrContext } from '../types.js';
import { componentName } from './component-vnode.js';
import { renderPreparedResumptionBoundary } from './prepared-resumption-boundary.js';

/** Wraps one SSR-rendered resumable component in its eager client activation boundary. */
export function renderResumableComponentBoundary(
	context: SsrContext,
	vnode: VNode,
	id: string,
	html: string,
	props: Record<string, unknown>
): string {
	if (typeof vnode.type !== 'function') return markerPair(context, id, () => html);
	const contract = readPreparedExactCompiledComponentContract(vnode.type);
	if (!contract.resumption || !contract.continuations.length)
		return markerPair(context, id, () => html);
	const name =
		contract.implementations.find((implementation) => implementation.role === 'root')?.name ??
		componentName(vnode.type);
	return renderPreparedResumptionBoundary(context, id, name, html, props);
}
