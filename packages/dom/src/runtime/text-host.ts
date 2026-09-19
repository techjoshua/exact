import { installTextHostIntegration } from '../text-host-integration.js';

installTextHostIntegration();

/** Issues a text-host receipt while selecting its DOM presentation implementation. */
export { createCompiledIntrinsicReceipt as createCompiledTextHostReceipt } from '@exactjs/core/runtime/component-operations';
