import '@exactjs/react-compat/react18';
import ReactDOMClient from './client.js';
export * from './client.js';
/** Provides the canonical version value. */
export const version = '18.3.1-exact';
export default { ...ReactDOMClient, version };
