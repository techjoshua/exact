import type { AnyComponentInstance } from '@exactjs/core';
import {
	createEffectScope,
	createDetachedEffectScope,
	type EffectScope
} from '@exactjs/reactive/framework/runtime';
import { componentMounts } from '../state.js';
import type { Mounted } from '../types.js';

/** Transfers a mounted component instance to its DOM range for exactly-once teardown. */
export function ownMountedInstance(mounted: Mounted, instance: AnyComponentInstance): void {
	mounted.instance = instance;
	componentMounts.set(instance, mounted);
}

/** Creates a receiving scope with the explicit DOM owner before any authored work runs. */
export function createMountedScope(parent: EffectScope | undefined): EffectScope {
	return parent === undefined ? createDetachedEffectScope() : createEffectScope(parent);
}
