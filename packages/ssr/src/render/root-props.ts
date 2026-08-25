import type { VNode } from '@exactjs/core';
import { exactComponentIdentity } from '@exactjs/core/framework/component-contracts';
import type { HydrationScriptOptions, RenderToStringOptions } from '../types.js';
import { getComponentProps } from './component-vnode.js';

/** Resolves explicit root-prop publication once so render and resumption share one object graph. */
export function rootPropsOptions<T extends RenderToStringOptions & HydrationScriptOptions>(
	vnode: VNode,
	options: T
): T {
	if (!options.publishRootProps) return options;
	if (options.state !== undefined)
		throw new TypeError('publishRootProps cannot be combined with an explicit hydration state');
	if (typeof vnode.type !== 'function')
		throw new TypeError('publishRootProps requires a component root');
	return { ...options, state: getComponentProps(vnode) };
}

/** Returns compiler identity only for a native component root. */
export function rootComponentIdentity(vnode: VNode): string | undefined {
	return typeof vnode.type === 'function' ? exactComponentIdentity(vnode.type) : undefined;
}
