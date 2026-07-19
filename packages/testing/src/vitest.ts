export { exactMatchers, installExactMatchers as installVitestMatchers } from './matchers/exact.js';
export type { ExactMatcherDeclarations, ExpectLike } from './matchers/exact.js';

import type {} from 'vitest';
import type { ExactMatcherDeclarations } from './matchers/exact.js';
declare module 'vitest' {
	interface Assertion<T = any> extends ExactMatcherDeclarations<void> {}
	interface AsymmetricMatchersContaining extends ExactMatcherDeclarations<void> {}
}
