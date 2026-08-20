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

/** Creates a fixed-size client store; callers create it only after DevTools attaches. */
export function createExactClientEventStore(
	maxEvents: number,
	maxBytes: number
): ExactClientEventStore {
	const events: Array<{ event: ExactRuntimeInspectionEvent; bytes: number }> = [];
	const listeners = new Set<{
		filter?: ExactInspectionFilter;
		listener: (event: ExactRuntimeInspectionEvent) => void;
	}>();
	let retainedBytes = 0;
	let sequence = 0;
	const store: ExactClientEventStore = {
		publish(event) {
			const nextSequence = ++sequence;
			const retained = Object.freeze({
				...event,
				sequence: nextSequence,
				cursor: nextSequence.toString(36)
			});
			const bytes = new TextEncoder().encode(JSON.stringify(retained)).byteLength;
			if (bytes > maxBytes) return;
			events.push({ event: retained, bytes });
			retainedBytes += bytes;
			while (events.length > maxEvents || retainedBytes > maxBytes)
				retainedBytes -= events.shift()!.bytes;
			for (const subscription of listeners)
				if (exactInspectionEventMatches(retained, subscription.filter))
					deliver(subscription.listener, retained);
		},
		query(cursor, filter) {
			const sequence = cursor ? Number.parseInt(cursor, 36) : 0;
			return Object.freeze(
				events
					.map(({ event }) => event)
					.filter(
						(event) => event.sequence > sequence && exactInspectionEventMatches(event, filter)
					)
			);
		},
		subscribe(cursor, filter, listener) {
			for (const event of store.query(cursor, filter)) deliver(listener, event);
			const subscription = { filter, listener };
			listeners.add(subscription);
			return () => listeners.delete(subscription);
		},
		clear() {
			events.length = 0;
			retainedBytes = 0;
			listeners.clear();
			sequence = 0;
		}
	};
	return Object.freeze(store);
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
