import type { ComponentRegistryRuntime } from './contracts.js';

/** Associates each frozen public registry value with its compiler-created runtime record. */
export const componentRegistryValues = new WeakMap<object, ComponentRegistryRuntime>();
