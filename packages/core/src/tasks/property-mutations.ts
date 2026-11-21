import { sharedTaskRuntimeState } from './runtime-state.js';
import { unwrap, withReactivePropertyMutationObserver } from '@exactjs/reactive/framework/runtime';
import { frameForTaskSignal } from './frame-continuation.js';

/** Generation-owned evidence retained until publication or discard. */
type Capture = {
	readonly root?: AbortSignal;
	readonly requestInvocations?: true;
	readonly requestReads?: { root: object; receivers: WeakSet<object> };
	readonly collectionPaths?: WeakMap<object, string[]>;
	retire?: (this: AbortSignal) => void;
	receivers: WeakMap<object, Map<PropertyKey, 'set' | 'delete'>>;
	observer: (receiver: object, key: PropertyKey, operation: 'set' | 'delete') => void;
	changed: boolean;
};
const state = sharedTaskRuntimeState(
	'property-publication',
	(): {
		captures: WeakMap<AbortSignal, Capture>;
		count: number;
		requestInvocations?: WeakMap<AbortSignal, Capture>;
	} => ({ captures: new WeakMap(), count: 0 })
);
const { captures } = state;

/** Captures performed writes until take or discard. Request captures also admit explicit same-owner invocations without attaching their lifetime. */
export function captureTaskPropertyMutations(
	signal: AbortSignal,
	options?: {
		readonly requestInvocations: true;
		readonly requestReads?: { root: object; receivers: WeakSet<object> };
		readonly collectionPaths?: WeakMap<object, string[]>;
	}
): void {
	if (signal.aborted) return;
	releaseTaskPropertyMutationCaptureAlias(signal);
	if (captures.has(signal)) return;
	const capture: Capture = {
		root: signal,
		collectionPaths: options?.collectionPaths,
		requestReads: options?.requestReads,
		...(options?.requestInvocations ? { requestInvocations: true as const } : {}),
		receivers: new WeakMap(),
		changed: false,
		observer(receiver, key, operation) {
			if (signal.aborted || captures.get(signal) !== capture) return;
			const raw = unwrap(receiver);
			let keys = capture.receivers.get(raw);
			if (!keys) capture.receivers.set(raw, (keys = new Map()));
			keys.set(typeof key === 'symbol' ? key : String(key), operation);
			capture.changed = true;
		}
	};
	captures.set(signal, capture);
	state.count++;
	if (capture.requestInvocations) {
		capture.retire = function () {
			if (captures.get(this) === capture) {
				captures.delete(this);
				state.count--;
			}
			if (state.requestInvocations?.get(this) === capture) state.requestInvocations.delete(this);
		};
		signal.addEventListener('abort', capture.retire, { once: true });
	}
}

/** Selects read-only data receivers from this exact submitted activation. */
export function taskRequestReadReceivers(
	signal: AbortSignal,
	root: object
): WeakSet<object> | undefined {
	const request = state.count && captures.get(taskPublicationCaptureOwner(signal))?.requestReads;
	return request && request.root === root ? request.receivers : undefined;
}

/** Supplies only the request-authorized paths for submitted native collection identities. */
export function taskCollectionMutationPaths(
	signal: AbortSignal
): WeakMap<object, string[]> | undefined {
	return state.count
		? captures.get(taskPublicationCaptureOwner(signal))?.collectionPaths
		: undefined;
}

/** Pins the caller's exact live request capture before a generation can queue or detach. */
export function associateTaskPropertyMutationCapture(
	signal: AbortSignal,
	parent: AbortSignal
): void {
	if (
		!state.count ||
		signal.aborted ||
		parent.aborted ||
		captures.has(signal) ||
		state.requestInvocations?.has(signal)
	)
		return;
	const capture = captures.get(taskPublicationCaptureOwner(parent));
	if (
		!capture?.requestInvocations ||
		!capture.root ||
		capture.root.aborted ||
		captures.get(capture.root) !== capture
	)
		return;
	(state.requestInvocations ??= new WeakMap()).set(signal, capture);
	signal.addEventListener('abort', capture.retire!, { once: true });
}

/** Releases only the generation association, retaining the request sink and other invocations. */
export function releaseTaskPropertyMutationCaptureAlias(signal: AbortSignal): void {
	const capture = state.requestInvocations?.get(signal);
	if (!capture) return;
	state.requestInvocations!.delete(signal);
	signal.removeEventListener('abort', capture.retire!);
}

/** Binds synchronous write evidence to an explicitly fenced generation. Owned child frames inherit the nearest capture, while independent and detached work do not. */
export function withTaskPropertyMutationCapture<Value>(
	signal: AbortSignal,
	work: () => Value
): Value {
	if (!state.count) return work();
	const owner = taskPublicationCaptureOwner(signal);
	return withReactivePropertyMutationObserver(captures.get(owner)?.observer, work);
}

/** Selects structural capture or an explicitly admitted request sink. Retired aliases stop lookup instead of joining a replacement request. */
export function taskPublicationCaptureOwner(signal: AbortSignal): AbortSignal {
	if (!state.count) return signal;
	const direct = captureOwner(signal);
	if (direct) return direct;
	for (let frame = frameForTaskSignal(signal); frame; frame = frame.parent) {
		const owner = captureOwner(frame.controller.signal);
		if (owner) return owner;
	}
	return signal;
}

function captureOwner(signal: AbortSignal): AbortSignal | undefined {
	if (captures.has(signal)) {
		releaseTaskPropertyMutationCaptureAlias(signal);
		return signal;
	}
	const capture = state.requestInvocations?.get(signal);
	if (!capture) return;
	const root = capture.root!;
	return !root.aborted && captures.get(root) === capture ? root : signal;
}

/** Queries the existing scalar evidence by property or by one already selected receiver. */
export type TaskPropertyMutationQuery = {
	(receiver: object, key: PropertyKey): 'set' | 'delete' | undefined;
	fields(receiver: object): ReadonlyMap<PropertyKey, 'set' | 'delete'> | undefined;
};

/** Transfers ordinary performed scalar evidence and releases the request capture. */
export function takeTaskPropertyMutations(
	signal: AbortSignal
): TaskPropertyMutationQuery | undefined {
	const capture = captures.get(signal);
	discardTaskPropertyMutations(signal);
	if (!capture?.changed) return;
	const fields = (receiver: object) => capture.receivers.get(unwrap(receiver));
	const query: TaskPropertyMutationQuery = (receiver, key) =>
		fields(receiver)?.get(typeof key === 'symbol' ? key : String(key));
	query.fields = fields;
	return query;
}

/** Releases property write evidence when publication fails or a task generation is cancelled. */
export function discardTaskPropertyMutations(signal: AbortSignal): void {
	releaseTaskPropertyMutationCaptureAlias(signal);
	const capture = captures.get(signal);
	if (captures.delete(signal)) {
		if (capture?.retire) signal.removeEventListener('abort', capture.retire);
		state.count--;
	}
}
