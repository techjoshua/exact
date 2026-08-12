import type { AnalysisJob, Incident } from './contracts.js';

/** Updates the browser URL without transferring durable component ownership. */
export function navigateToIncident(id: string): void {
	history.pushState({}, '', `/incidents/${id}`);
}

/** Connects the browser event stream for one component lifetime. */
export function openIncidentEvents(
	onIncident: (incident: Incident) => void,
	onJob: (job: AnalysisJob) => void,
	signal: AbortSignal
): void {
	const events = new EventSource('/events');
	events.addEventListener('incident', (event) =>
		onIncident(JSON.parse((event as MessageEvent<string>).data))
	);
	events.addEventListener('job', (event) =>
		onJob(JSON.parse((event as MessageEvent<string>).data))
	);
	signal.addEventListener('abort', () => events.close(), { once: true });
}
