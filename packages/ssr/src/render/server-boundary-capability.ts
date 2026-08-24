import type { VNode } from '@exactjs/core';
import type { AnyComponentInstance, RenderToStringOptions, SsrContext } from '../types.js';
import { realmSsrCapability, registerRealmSsrCapability } from './realm-capability.js';

type ServerBoundaryCapability = Readonly<{
	render(context: SsrContext, vnode: VNode): string;
	renderAsync(
		context: SsrContext,
		vnode: VNode,
		parent: AnyComponentInstance | undefined,
		options: RenderToStringOptions
	): Promise<string>;
}>;

const capabilityName = 'server-boundary';

/** Installs client-boundary and resumption rendering for artifacts that emit those structures. */
export function registerServerBoundaryCapability(next: ServerBoundaryCapability): void {
	registerRealmSsrCapability(capabilityName, next);
}

/** Renders an explicitly compiler-selected server boundary. */
export function renderServerBoundary(context: SsrContext, vnode: VNode): string {
	const capability = realmSsrCapability<ServerBoundaryCapability>(capabilityName);
	if (!capability)
		throw new TypeError('Server boundary rendering requires its compiler capability');
	return capability.render(context, vnode);
}

/** Renders an explicitly compiler-selected server boundary asynchronously. */
export function renderServerBoundaryAsync(
	context: SsrContext,
	vnode: VNode,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions
): Promise<string> {
	const capability = realmSsrCapability<ServerBoundaryCapability>(capabilityName);
	if (!capability)
		throw new TypeError('Server boundary rendering requires its compiler capability');
	return capability.renderAsync(context, vnode, parent, options);
}
