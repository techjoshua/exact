import React from './default-export.js';
import { setReactCompatibilityTarget } from './internals.js';
setReactCompatibilityTarget(19);
export * from './public.js';
/** Provides the canonical version value. */
export const version = '19.2.0-exact';
export default { ...React, version };
