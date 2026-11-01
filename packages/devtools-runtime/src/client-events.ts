import {
	exactInspectionEventMatches,
	type ExactInspectionFilter,
	type ExactRuntimeInspectionEvent,
	type ExactRuntimeInspectionSink
} from '@exactjs/devtools-protocol';

/** Attached-only bounded client event history and subscriptions. */
export interface ExactClientEventStore extends ExactRuntimeInspectionSink {
	query(cursor?: string, filter?: ExactInspectionFilter): readonly ExactRuntimeInspectionEvent[];
	subscribe(
		cursor: string | undefined,
		filter: ExactInspectionFilter | undefined,
		listener: (event: ExactRuntimeInspectionEvent) => void
	): () => void;
	clear(): void;
}

/** Creates attached-only history with safe-integer retention budgets, detached observations, and ordered reentrant delivery. Zero events disables history while preserving live delivery. */
export function createExactClientEventStore(
	maxEvents: number,
	maxBytes: number
): ExactClientEventStore {
	if (![maxEvents, maxBytes].every((value) => Number.isSafeInteger(value) && value >= 0))
		throw new RangeError('Client event retention budgets must be nonnegative safe integers');
	/** Registration identity fences queued delivery after removal. */
	type Subscription = {
		filter?: ExactInspectionFilter;
		listener: (event: ExactRuntimeInspectionEvent) => void;
	};
	/** Detached serialized data and its bounded retention cost. */
	type Retained = { payload: string; sequence: number; bytes: number };
	const events: Retained[] = [];
	const listeners = new Set<Subscription>();
	const pending: Array<{ event: Retained; targets: Subscription[] }> = [];
	const encoder = new TextEncoder();
	let retainedBytes = 0,
		sequence = 0,
		revision = 0;
	let delivering = false;
	/** Drains complete replay batches and captured live targets without recursive observer calls. */
	const drain = () => {
		if (delivering) return;
		delivering = true;
		try {
			while (pending.length) {
				const { event, targets } = pending.shift()!;
				for (const subscription of targets) {
					if (!listeners.has(subscription)) continue;
					const observation = JSON.parse(event.payload) as ExactRuntimeInspectionEvent;
					if (exactInspectionEventMatches(observation, subscription.filter))
						deliver(subscription.listener, observation);
				}
			}
		} finally {
			pending.length = 0;
			delivering = false;
		}
	};
	const history = (cursor?: string) => {
		const after = cursor ? Number.parseInt(cursor, 36) : 0;
		return events.filter((event) => event.sequence > after);
	};
	const store: ExactClientEventStore = {
		publish(event) {
			const generation = revision;
			// Serialization already determines retention bytes. Keep its detached data rather
			// than caller-owned objects, and allocate sequence only after reentrant capture.
			const captured = JSON.parse(JSON.stringify(event)) as ExactRuntimeInspectionEvent;
			if (revision !== generation) return;
			const nextSequence = ++sequence;
			const payload = JSON.stringify({
				...captured,
				sequence: nextSequence,
				cursor: nextSequence.toString(36)
			});
			const bytes = encoder.encode(payload).byteLength;
			if (bytes > maxBytes) return;
			const retained = { payload, sequence: nextSequence, bytes };
			events.push(retained);
			retainedBytes += bytes;
			while (events.length > maxEvents || retainedBytes > maxBytes)
				retainedBytes -= events.shift()!.bytes;
			pending.push({ event: retained, targets: [...listeners] });
			drain();
		},
		query(cursor, filter) {
			return history(cursor)
				.map(({ payload }) => JSON.parse(payload) as ExactRuntimeInspectionEvent)
				.filter((event) => exactInspectionEventMatches(event, filter));
		},
		subscribe(cursor, filter, listener) {
			const replay = history(cursor);
			const subscription = { filter, listener };
			listeners.add(subscription);
			for (const event of replay) pending.push({ event, targets: [subscription] });
			drain();
			return () => listeners.delete(subscription);
		},
		clear() {
			revision++;
			events.length = pending.length = retainedBytes = sequence = 0;
			listeners.clear();
		}
	};
	return store;
}

function deliver(
	listener: (event: ExactRuntimeInspectionEvent) => void,
	event: ExactRuntimeInspectionEvent
): void {
	try {
		listener(event);
	} catch {
		// Inspection subscribers are observational and cannot affect application publication.
	}
}
