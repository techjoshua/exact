import '@exact/react-compat/react19';
import * as Server from './server-node.js';
import { resume, resumeToPipeableStream } from './static-node.js';
export * from './server-node.js';
export { resume, resumeToPipeableStream };
/** Provides the canonical version value. */
export const version = '19.2.0-exact';
export default { ...Server, resume, resumeToPipeableStream, version };
