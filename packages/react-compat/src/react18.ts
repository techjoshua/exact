import React from './default-export.js';
import { setReactCompatibilityTarget } from './runtime/shared.js';
setReactCompatibilityTarget(18);
export * from './public.js';
/** Provides the canonical version value. */
export const version = '18.3.1-exact';
export default { ...React, version };
