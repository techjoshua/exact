export { exactMatchers, installExactMatchers as installVitestMatchers } from './index.js';
export type { ExactMatcherDeclarations, ExpectLike } from './index.js';

import type {} from 'vitest';
import type { ExactMatcherDeclarations } from './index.js';
declare module 'vitest' {
	interface Assertion<T = any> extends ExactMatcherDeclarations<void> {}
	interface AsymmetricMatchersContaining extends ExactMatcherDeclarations<void> {}
}
