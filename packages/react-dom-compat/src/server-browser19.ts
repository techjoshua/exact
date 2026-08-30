import '@exactjs/react-compat/react19';
import * as Server from './server/shared.js';
import { resume } from './static-shared.js';
export * from './server/shared.js';
export { resume };
/** Provides the canonical version value. */
export const version = '19.2.0-exact';
export default { ...Server, resume, version };
