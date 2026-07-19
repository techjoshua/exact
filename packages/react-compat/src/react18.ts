import React from './index.js';
import { setReactCompatibilityTarget } from './internals.js';
setReactCompatibilityTarget(18);
export * from './index.js';
export const version = '18.3.1-exact';
export default { ...React, version };
