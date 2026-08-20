export { exactMatchers, installExactMatchers as installVitestMatchers } from './matchers/exact.js';
export type { ExactMatcherDeclarations, ExpectLike } from './matchers/exact.js';

import type {} from 'vitest';
import type { ExactMatcherDeclarations } from './matchers/exact.js';
declare module 'vitest' {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Vitest declares Assertion with this permissive default; augmentation must merge the identical type parameter.
	interface Assertion<T = any> extends ExactMatcherDeclarations<void> {}
	interface AsymmetricMatchersContaining extends ExactMatcherDeclarations<void> {}
}
