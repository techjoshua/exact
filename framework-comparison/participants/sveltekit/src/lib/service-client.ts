import type { AnalysisJob, Incident, User } from './contracts.js';

/** Controlled-service origin used by SvelteKit browser operations. */
export const serviceUrl = 'http://127.0.0.1:4310';

/** Loads the session and queue together for an explicit refresh. */
export async function loadIncidentData(fetcher: typeof fetch = fetch) {
	const [sessionResponse, incidentsResponse] = await Promise.all([
		fetcher(`${serviceUrl}/api/session`),
		fetcher(`${serviceUrl}/api/incidents`)
	]);
	if (!sessionResponse.ok || !incidentsResponse.ok) throw new Error('Service unavailable');
	const session = (await sessionResponse.json()) as { sessionUserId: string; users: User[] };
	const queue = (await incidentsResponse.json()) as { incidents: Incident[] };
	return { ...session, ...queue };
}

/** Submits a version-fenced claim and retains the service response for conflict handling. */
export async function claimIncident(id: string, actorId: string, expectedVersion: number) {
	const response = await fetch(`${serviceUrl}/api/incidents/${id}/claim`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ actorId, expectedVersion })
	});
	return { response, payload: await response.json() };
}

/** Submits one idempotent response-log mutation. */
export async function submitComment(id: string, actorId: string, body: string) {
	const response = await fetch(`${serviceUrl}/api/incidents/${id}/comments`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ actorId, body, clientMutationId: crypto.randomUUID() })
	});
	return { response, payload: await response.json() };
}

/** Starts server analysis and returns the queued job payload. */
export async function requestAnalysis(id: string) {
	const response = await fetch(`${serviceUrl}/api/incidents/${id}/analysis`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: '{}'
	});
	return {
		response,
		payload: (await response.json()) as { job?: AnalysisJob; error?: { message?: string } }
	};
}
