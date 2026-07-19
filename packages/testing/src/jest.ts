export { exactMatchers, installExactMatchers as installJestMatchers } from './matchers/exact.js';
export type { ExactMatcherDeclarations, ExpectLike } from './matchers/exact.js';

import type { ExactMatcherDeclarations } from './matchers/exact.js';
declare global {
	namespace jest {
		interface Matchers<R, T = {}> extends ExactMatcherDeclarations<R> {}
	}
}
