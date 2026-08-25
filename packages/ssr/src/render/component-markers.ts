import type { VNode } from '@exactjs/core';
import { exactComponentIdentity } from '@exactjs/core/framework/component-contracts';
import { markerId } from '../markup.js';
import type { SsrContext } from '../types.js';

/** Returns the stable protocol identity embedded in a hydratable component marker. */
export function componentMarkerIdentity(type: VNode['type']): string {
	return typeof type === 'function' ? exactComponentIdentity(type) : String(type);
}

/** Allocates one component marker from its compiler identity and authored key. */
export function componentMarkerId(context: SsrContext, vnode: VNode): string {
	return markerId(context, 'component', componentMarkerIdentity(vnode.type), vnode.key);
}
