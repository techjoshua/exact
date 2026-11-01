/** Array property and structural controls sharing one optimistic ownership contract. */
export const arrayPropertyJournalCases: readonly string[];
/** Public Reactive operations and compiler assignment used by the shared native-property journey. */
type ArrayPropertyApi = Pick<
	typeof import('../../reactive/src/index.js'),
	'reactive' | 'captureReactiveMutations' | 'batch' | 'watch' | 'flushSync' | 'unwrap'
> & {
	deleteReactiveValue: typeof import('../../reactive/src/writes.js').deleteReactiveValue;
	writeReactiveLazy: typeof import('../../reactive/src/writes.js').writeReactiveLazy;
};
/** Checks array shape, holes, entry order, ownership, and existing numeric subscribers. */
export function verifyArrayPropertyJournal(api: ArrayPropertyApi, kind: string): true;
/** Checks target publication and supplied value identity across ordinary and custom receivers. */
export function verifyReactiveReceiverOwnership(
	api: Pick<ArrayPropertyApi, 'reactive' | 'watch' | 'flushSync'>
): true;
