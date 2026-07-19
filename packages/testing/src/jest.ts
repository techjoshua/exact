export { exactMatchers } from './index.js';
export { installExactMatchers as installJestMatchers } from './index.js';
export type { ExactMatcherDeclarations, ExpectLike } from './index.js';

import type { ExactMatcherDeclarations } from './index.js';
declare global {
	namespace jest {
		interface Matchers<R, T = {}> extends ExactMatcherDeclarations<R> {}
	}
}
