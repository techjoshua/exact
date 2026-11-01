/** Public operations exercised by the collection ownership and keyed transport journeys. */
type CollectionApi = Pick<
	typeof import('../../reactive/src/index.js'),
	| 'unwrap'
	| 'reactive'
	| 'indexedReactive'
	| 'captureReactiveMutations'
	| 'batch'
	| 'watch'
	| 'flushSync'
	| 'mutateReactiveCollection'
	| 'registerReactiveListKey'
	| 'encodeReactiveProtocolValue'
	| 'decodeReactiveProtocolValue'
	| 'writeReactive'
>;
/** Clear settlement and independent mutation controls. */
export const collectionClearCases: readonly string[];
/** Keyed inverse and transport controls. */
export const hashRollbackCases: readonly string[];
/** Storage representations whose mutations must invalidate keyed item hashes. */
export const hashOwnerKinds: readonly string[];
/** Checks per-key restoration, native successor order, observation, and later updates. */
export function verifyCollectionClear(api: CollectionApi, kind: string, mode: string): true;
/** Checks values received after rollback or commit and a subsequent update. */
export function verifyHashRollback(api: CollectionApi, mode: string): true;
/** Checks forwarded proxy identity, descriptor acceptance, and keyed receiving values. */
export function verifyHashOwner(api: CollectionApi, kind: string, operation: string): true;
