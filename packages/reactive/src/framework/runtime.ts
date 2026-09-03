export {
	createExternalSource,
	createSelectedExternalSource,
	type ExternalSource,
	type ExternalSourceOptions,
	type SelectedExternalSourceOptions
} from '../external-source.js';
export {
	batch,
	captureReactiveMutations,
	publishBatch,
	rollbackReactiveMutationJournals,
	peek,
	readMutationVersion,
	type ReactiveMutationJournal
} from '../internal/deps.js';
export {
	currentWorkPriority,
	flushSync,
	inspectScheduledWork,
	runWithPriority,
	scheduleWork,
	setScheduledWorkContextCapture,
	type ScheduledWorkContext
} from '../internal/scheduler.js';
export {
	createEffectScope,
	createProfiledEffectScope,
	effectScopeWorkPriority,
	registerEffectScopeCleanup,
	setEffectScopeWorkPriority,
	transferEffectScope,
	whenEffectScopeResumed,
	withEffectScope
} from '../internal/scopes.js';
export type {
	EffectScope,
	Reactive,
	ReactiveOptions,
	ReactiveProfileEvent,
	ReactiveRef,
	ReactiveValue,
	StopHandle,
	WorkPriority,
	WatchOptions
} from '../internal/types.js';
export { isReactive, isReactiveValue, unwrap } from '../internal/values.js';
export { computed, inspectComputed, type ComputedInspection } from '../computation.js';
export {
	collectionRef,
	ref,
	subscribe,
	subscribeKeys,
	trackCollectionStructure,
	watch,
	watchStructural
} from '../observation.js';
export {
	compiledReactivePropertyOperand,
	createIndexedReactiveValue,
	deleteIndexedReactiveSlot,
	deleteIndexedReactiveSlotWithResult,
	updateIndexedReactive,
	reactiveIndexedDependencies,
	reactiveOwnDependencies,
	readIndexedReactiveSource,
	readIndexedReactiveSlot,
	peekIndexedReactiveSlot,
	readReactiveOwnProperty,
	setIndexedReactiveSlot,
	setIndexedReactiveSlotWithResult
} from '../indexed-base.js';
export type { CompiledReactivePropertyOperand } from '../indexed-base.js';
export { snapshot } from '../snapshot.js';
export { decodeReactiveProtocolValue, encodeReactiveProtocolValue } from '../protocol.js';
export { isTransportableReactiveMapKey } from '../internal/keyed/protocol.js';
export { updateReactive, updateReactiveShallow } from '../reconciliation.js';
export {
	deleteIndexedReactiveValue,
	deleteReactiveValue,
	mutateReactiveArray,
	mutateReactiveCollection,
	registerReactiveListKey,
	updateIndexedReactiveValue,
	updateIndexedReactiveValueWithResult,
	updateReactiveValue,
	updateReactiveValueWithResult,
	writeIndexedReactiveValue,
	writeReactive,
	writeReactiveLazy
} from '../writes.js';
