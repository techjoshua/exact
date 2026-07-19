import React from './index.js';
import { setReactCompatibilityTarget } from './internals.js';
setReactCompatibilityTarget(19);
export * from './index.js';
export const version = '19.2.0-exact';
export default { ...React, version };
