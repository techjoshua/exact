import React from './default-export.js';
import { setReactCompatibilityTarget } from './internals.js';
setReactCompatibilityTarget(18);
export * from './public.js';
export const version = '18.3.1-exact';
export default { ...React, version };
