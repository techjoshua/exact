import type { Child } from '@exactjs/core';

/** Compiler-backed root used by DOM tests that begin from a focused opaque operation. */
export function TestOperationRoot(props: { operation: Child }) {
	return () => props.operation;
}
