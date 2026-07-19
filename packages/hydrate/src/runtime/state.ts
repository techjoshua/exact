import type { HydrationRoot } from '../types.js';

/** Provides the canonical roots value. */
export const roots = new WeakMap<Element, HydrationRoot>();

/** Provides the canonical request versions value. */
export const requestVersions = new WeakMap<Element, Map<string, number>>();
