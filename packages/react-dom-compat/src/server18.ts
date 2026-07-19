import '@exact/react-compat/react18';
import * as Server from './server-node.js';
export * from './server-node.js';
export const version = '18.3.1-exact';
export default { ...Server, version };
