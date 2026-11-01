/** Reactive storage and compiler-owned pending publication used by native Map value controls. */
type MapValueApi = Pick<
	typeof import('../../reactive/src/index.js'),
	| 'reactive'
	| 'watch'
	| 'unwrap'
	| 'flushSync'
	| 'captureReactiveMutations'
	| 'mutateReactiveCollection'
> & {
	createPendingReactiveTransaction: typeof import('../../reactive/src/pending/pending-state.js').createPendingReactiveTransaction;
};
/** Native value identity and settlement variations. */
export const mapNativeValueCases: readonly string[];
/** Checks retained references, subscribers, getter isolation, and inverse ownership. */
export function verifyMapNativeValue(api: MapValueApi, mode: string): true;
