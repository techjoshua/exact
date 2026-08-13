import type { AnalysisJob, Incident, User } from './types.js';

/** Stable controlled-service origin used by this participant's browser transport. */
export const serviceUrl = 'http://127.0.0.1:4310';

/** Loads the controlled session and incident queue as one application resource. */
export async function loadIncidentData() {
	const [sessionResponse, incidentsResponse] = await Promise.all([
		fetch(`${serviceUrl}/api/session`),
		fetch(`${serviceUrl}/api/incidents`)
	]);
	if (!sessionResponse.ok || !incidentsResponse.ok) throw new Error('Service unavailable');
	const session = (await sessionResponse.json()) as { sessionUserId: string; users: User[] };
	const queue = (await incidentsResponse.json()) as { incidents: Incident[] };
	return { ...session, ...queue };
}

/** Sends an optimistic-concurrency claim and preserves the authoritative conflict payload. */
export async function claimIncident(incidentId: string, actorId: string, expectedVersion: number) {
	const response = await fetch(`${serviceUrl}/api/incidents/${incidentId}/claim`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ actorId, expectedVersion })
	});
	const payload = (await response.json()) as {
		incident?: Incident;
		error?: { current?: Incident; message?: string };
	};
	return { response, payload };
}

/** Submits an idempotent comment mutation and returns the decoded service result. */
export async function submitComment(
	incidentId: string,
	actorId: string,
	body: string,
	clientMutationId: string
) {
	const response = await fetch(`${serviceUrl}/api/incidents/${incidentId}/comments`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ actorId, body, clientMutationId })
	});
	const payload = (await response.json()) as {
		incident?: Incident;
		error?: { message?: string };
	};
	return { response, payload };
}

/** Starts server analysis and returns its queued job or service error. */
export async function requestAnalysis(incidentId: string) {
	const response = await fetch(`${serviceUrl}/api/incidents/${incidentId}/analysis`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: '{}'
	});
	const payload = (await response.json()) as {
		job?: AnalysisJob;
		error?: { message?: string };
	};
	return { response, payload };
}
