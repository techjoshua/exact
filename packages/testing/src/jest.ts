export { exactMatchers, installExactMatchers as installJestMatchers } from './matchers/exact.js';
export type { ExactMatcherDeclarations, ExpectLike } from './matchers/exact.js';

import type { ExactMatcherDeclarations } from './matchers/exact.js';
import type {} from 'expect';

declare module 'expect' {
	/** Supports expect imported from @jest/globals as well as global Jest declarations. */
	interface Matchers<R extends void | Promise<void>, T> extends ExactMatcherDeclarations<R> {}
}
declare global {
	namespace jest {
		interface Matchers<R, T = {}> extends ExactMatcherDeclarations<R> {}
	}
}
