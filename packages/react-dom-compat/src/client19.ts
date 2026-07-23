import '@exactjs/react-compat/react19';
import ReactDOMClient from './client.js';
export * from './client.js';
/** Provides the canonical version value. */
export const version = '19.2.0-exact';
export default { ...ReactDOMClient, version };
