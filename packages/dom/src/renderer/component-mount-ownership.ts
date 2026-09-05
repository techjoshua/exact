import type { AnyComponentInstance } from '@exactjs/core';
import { componentMounts } from '../state.js';
import type { Mounted } from '../types.js';

/** Transfers a mounted component instance to its DOM range for exactly-once teardown. */
export function ownMountedInstance(mounted: Mounted, instance: AnyComponentInstance): void {
	mounted.instance = instance;
	componentMounts.set(instance, mounted);
}
