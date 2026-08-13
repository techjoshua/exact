import type { CoreHydrationRoot } from '../types.js';

/** Provides the canonical roots value. */
export const roots = new WeakMap<Element, CoreHydrationRoot>();

/** Provides the canonical request versions value. */
export const requestVersions = new WeakMap<Element, Map<string, number>>();
