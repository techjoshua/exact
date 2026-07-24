import type { ExactMatcherDeclarations } from '@exactjs/testing';

declare module 'bun:test' {
	// Bun requires this declaration to repeat its generic parameter exactly.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	interface Matchers<T = unknown> extends ExactMatcherDeclarations<void> {}
	interface AsymmetricMatchers extends ExactMatcherDeclarations<void> {}
}
