import React from './default-export.js';
import { setReactCompatibilityTarget } from './internals.js';
setReactCompatibilityTarget(19);
export * from './public.js';
export const version = '19.2.0-exact';
export default { ...React, version };
