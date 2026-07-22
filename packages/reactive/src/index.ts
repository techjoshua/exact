export {
	createExternalSource,
	createSelectedExternalSource,
	type ExternalSource,
	type ExternalSourceOptions,
	type SelectedExternalSourceOptions
} from './external-source.js';
export { batch, peek } from './internal/deps.js';
export { flushSync } from './internal/scheduler.js';
export {
	createEffectScope,
	createProfiledEffectScope,
	transferEffectScope,
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
	WatchOptions
} from './internal/types.js';
export { isReactive, isReactiveValue, unwrap } from './internal/values.js';
export { computed, reactive, ref, snapshot, subscribe, watch } from './observation.js';
export { decodeReactiveProtocolValue, encodeReactiveProtocolValue } from './protocol.js';
export { updateReactive } from './reconciliation.js';
export {
	deleteReactiveValue,
	mutateReactiveArray,
	registerReactiveListKey,
	updateReactiveValue,
	updateReactiveValueWithResult,
	writeReactive,
	writeReactiveLazy
} from './writes.js';
