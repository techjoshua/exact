/** Checks assignment identity and subscription migration across general, numeric-slot, and reference writers. */
export function verifyAssignmentIdentity(
	api: Pick<
		typeof import('../../reactive/src/index.js'),
		'reactive' | 'indexedReactive' | 'watch' | 'ref' | 'flushSync' | 'unwrap' | 'writeReactive'
	> &
		Pick<typeof import('../../reactive/src/framework/runtime.js'), 'writeIndexedReactiveValue'>,
	options: {
		indexed: boolean;
		entry: 'native' | 'compiler' | 'ref';
		array: boolean;
		equal: boolean;
	}
): void;

/** Representative replacement cases for source and native package consumers. */
export const assignmentIdentityCases: readonly Parameters<typeof verifyAssignmentIdentity>[1][];
