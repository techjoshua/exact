import { serviceUrl } from './service-client.js';
import type { AnalysisJob, Incident } from './types.js';

/** Callbacks retained by the participant's one application-wide event stream. */
export type LiveServiceSubscriber = {
	onConnection?(status: 'Connecting' | 'Live service' | 'Reconnecting'): void;
	onIncident?(incident: Incident): void;
	onJob?(job: AnalysisJob): void;
};

const subscribers = new Set<LiveServiceSubscriber>();
let source: EventSource | undefined;
let connection: 'Connecting' | 'Live service' | 'Reconnecting' = 'Connecting';

/** Subscribes one surface and closes the shared EventSource after its final release. */
export function subscribeLiveService(subscriber: LiveServiceSubscriber): () => void {
	subscribers.add(subscriber);
	subscriber.onConnection?.(connection);
	ensureLiveService();
	let active = true;
	return () => {
		if (!active) return;
		active = false;
		subscribers.delete(subscriber);
		if (subscribers.size) return;
		source?.close();
		source = undefined;
		connection = 'Connecting';
	};
}

/** Opens the single browser transport and fans events out to mounted subscribers. */
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

function publishConnection(status: typeof connection): void {
	connection = status;
	for (const subscriber of subscribers) subscriber.onConnection?.(status);
}
