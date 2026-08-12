import type { AnalysisJob, Incident, InitialData, User } from './contracts.js';

/** Controlled-service origin used by Nuxt server and browser operations. */
export const serviceUrl = 'http://127.0.0.1:4310';

/** Loads initial SSR data through Nuxt's native request helper. */
export async function loadInitialData(): Promise<InitialData> {
	const [session, queue] = await Promise.all([
		$fetch<{ users: User[]; sessionUserId: string }>(`${serviceUrl}/api/session`),
		$fetch<{ incidents: Incident[] }>(`${serviceUrl}/api/incidents`)
	]);
	return { ...session, ...queue };
}

/** Refreshes both resources without automatic GET retry so failure recovery remains observable. */
export async function refreshIncidentData(): Promise<InitialData> {
	const [session, queue] = await Promise.all([
		$fetch<{ users: User[]; sessionUserId: string }>(`${serviceUrl}/api/session`, { retry: 0 }),
		$fetch<{ incidents: Incident[] }>(`${serviceUrl}/api/incidents`, { retry: 0 })
	]);
	return { ...session, ...queue };
}

/** Submits a version-fenced claim and retains conflict response metadata. */
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

/** Starts server analysis and returns its queued job payload. */
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
