import { serviceUrl } from './service-client.js';
import type { AnalysisJob, Incident } from './types.js';

/** Event callbacks retained by the participant's single application-wide service stream. */
export type LiveServiceSubscriber = {
	onConnection?(status: 'Connecting' | 'Live service' | 'Reconnecting'): void;
	onIncident?(incident: Incident): void;
	onJob?(job: AnalysisJob): void;
};

const subscribers = new Set<LiveServiceSubscriber>();
let source: EventSource | undefined;
let connection: 'Connecting' | 'Live service' | 'Reconnecting' = 'Connecting';

/**
 * Subscribes one mounted component to the shared live service and releases it with the supplied
 * lifecycle signal. The underlying EventSource closes when the last subscriber leaves.
 */
export function subscribeLiveService(
	subscriber: LiveServiceSubscriber,
	signal: AbortSignal
): () => void {
	subscribers.add(subscriber);
	subscriber.onConnection?.(connection);
	ensureLiveService();
	let active = true;
	const release = () => {
		if (!active) return;
		active = false;
		subscribers.delete(subscriber);
		if (subscribers.size) return;
		source?.close();
		source = undefined;
		connection = 'Connecting';
	};
	if (signal.aborted) release();
	else signal.addEventListener('abort', release, { once: true });
	return release;
}

/** Opens and wires the one transport resource shared by all mounted subscribers. */
function ensureLiveService(): void {
	if (source) return;
	source = new EventSource(`${serviceUrl}/api/events`);
	source.onopen = () => publishConnection('Live service');
	source.onerror = () => publishConnection('Reconnecting');
	source.addEventListener('incident', (event) => {
		const incident = JSON.parse((event as MessageEvent<string>).data) as Incident;
		for (const subscriber of subscribers) subscriber.onIncident?.(incident);
	});
	source.addEventListener('job', (event) => {
		const job = JSON.parse((event as MessageEvent<string>).data) as AnalysisJob;
		for (const subscriber of subscribers) subscriber.onJob?.(job);
	});
}

/** Publishes the current transport state to both existing and later subscribers. */
function publishConnection(status: typeof connection): void {
	connection = status;
	for (const subscriber of subscribers) subscriber.onConnection?.(status);
}
