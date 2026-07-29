export {
	createExternalSource,
	createSelectedExternalSource,
	type ExternalSource,
	type ExternalSourceOptions,
	type SelectedExternalSourceOptions
} from './external-source.js';
export {
	batch,
	captureReactiveMutations,
	rollbackReactiveMutationJournals,
	peek,
	type ReactiveMutationJournal
} from './internal/deps.js';
export {
	currentWorkPriority,
	flushSync,
	inspectScheduledWork,
	runWithPriority,
	scheduleWork
} from './internal/scheduler.js';
export {
	createEffectScope,
	createProfiledEffectScope,
	effectScopeWorkPriority,
	setEffectScopeWorkPriority,
	transferEffectScope,
	whenEffectScopeResumed,
	withEffectScope
} from './internal/scopes.js';
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
} from './internal/types.js';
export { isReactive, isReactiveValue, unwrap } from './internal/values.js';
export { computed, reactive, ref, snapshot, subscribe, watch } from './observation.js';
export { decodeReactiveProtocolValue, encodeReactiveProtocolValue } from './protocol.js';
export { updateReactive } from './reconciliation.js';
export {
	deleteReactiveValue,
	mutateReactiveArray,
	mutateReactiveCollection,
	registerReactiveListKey,
	updateReactiveValue,
	updateReactiveValueWithResult,
	writeReactive,
	writeReactiveLazy
} from './writes.js';
