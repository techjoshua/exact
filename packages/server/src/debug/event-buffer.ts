import {
	exactInspectionEventMatches,
	type ExactInspectionFilter,
	type ExactRuntimeInspectionEvent
} from '@exactjs/devtools-protocol';

/** Fixed resource ceilings for recent immutable server observations. */
export type ExactInspectionEventBufferLimits = Readonly<{
	maxEvents: number;
	maxBytes: number;
}>;

/** Bounded ordered event history and live subscription owner. */
export interface ExactInspectionEventBuffer {
	readonly size: number;
	publish(event: ExactRuntimeInspectionEvent): void;
	query(
		cursor?: string,
		filter?: ExactInspectionFilter
	): Readonly<{ events: readonly ExactRuntimeInspectionEvent[]; cursor: string }>;
	subscribe(
		cursor: string | undefined,
		filter: ExactInspectionFilter | undefined,
		listener: (event: ExactRuntimeInspectionEvent) => void
	): () => void;
	clear(): void;
}

type StoredEvent = {
	readonly event: ExactRuntimeInspectionEvent;
	readonly bytes: number;
};

/** Creates a count- and byte-bounded ring that preserves publication order. */
export function createExactInspectionEventBuffer(
	limits: ExactInspectionEventBufferLimits
): ExactInspectionEventBuffer {
	const events: StoredEvent[] = [];
	const subscribers = new Set<{
		filter?: ExactInspectionFilter;
		listener: (event: ExactRuntimeInspectionEvent) => void;
	}>();
	let bytes = 0;
	const buffer: ExactInspectionEventBuffer = {
		get size() {
			return events.length;
		},
		publish(event) {
			const encoded = JSON.stringify(event);
			const eventBytes = new TextEncoder().encode(encoded).byteLength;
			if (eventBytes > limits.maxBytes) return;
			events.push({ event, bytes: eventBytes });
			bytes += eventBytes;
			while (events.length > limits.maxEvents || bytes > limits.maxBytes) {
				bytes -= events.shift()!.bytes;
			}
			for (const subscriber of subscribers) {
				if (exactInspectionEventMatches(event, subscriber.filter))
					deliver(subscriber.listener, event);
			}
		},
		query(cursor, filter) {
			const offset = decodeCursor(cursor);
			const selected = events
				.filter(
					({ event }) => event.sequence > offset && exactInspectionEventMatches(event, filter)
				)
				.map(({ event }) => event);
			return Object.freeze({
				events: Object.freeze(selected),
				cursor: events.at(-1)?.event.cursor ?? cursor ?? '0'
			});
		},
		subscribe(cursor, filter, listener) {
			for (const event of events) {
				if (event.event.sequence <= decodeCursor(cursor)) continue;
				if (exactInspectionEventMatches(event.event, filter)) deliver(listener, event.event);
			}
			const subscription = { filter, listener };
			subscribers.add(subscription);
			return () => subscribers.delete(subscription);
		},
		clear() {
			events.length = 0;
			bytes = 0;
			subscribers.clear();
		}
	};
	return Object.freeze(buffer);
}

function deliver(
	listener: (event: ExactRuntimeInspectionEvent) => void,
	event: ExactRuntimeInspectionEvent
): void {
	try {
		listener(event);
	} catch {
		// Debug transport failures cannot escape into observed server work.
	}
}

function decodeCursor(cursor: string | undefined): number {
	if (!cursor || cursor === '0') return 0;
	if (!/^[0-9a-z]+$/.test(cursor)) throw new TypeError('Invalid inspection event cursor');
	const sequence = Number.parseInt(cursor, 36);
	if (!Number.isSafeInteger(sequence) || sequence < 0)
		throw new TypeError('Invalid inspection event cursor');
	return sequence;
}
