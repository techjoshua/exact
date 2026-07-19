import type { HydrationRoot } from '../types.js';

export const roots = new WeakMap<Element, HydrationRoot>();

export const requestVersions = new WeakMap<Element, Map<string, number>>();
