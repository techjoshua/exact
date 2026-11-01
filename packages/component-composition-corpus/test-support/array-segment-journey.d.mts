import type * as Reactive from '../../reactive/src/index.js';
/** Checks segment restoration, sparse ownership and release for small or wide arrays. */
export function verifyArraySegments(
	api: Pick<typeof Reactive, 'reactive' | 'batch' | 'captureReactiveMutations'>,
	count?: number
): void;
