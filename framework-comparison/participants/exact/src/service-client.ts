import type { AnalysisJob, Incident, User } from './types.js';

/** Controlled-service origin shared by this participant's transport operations. */
export const serviceUrl = 'http://127.0.0.1:4310';

/** Loads and decodes initial session and queue domain values without exposing transport resources. */
export async function loadIncidentData(signal?: AbortSignal) {
	const [sessionResponse, incidentsResponse] = await Promise.all([
		fetch(`${serviceUrl}/api/session`, { signal }),
		fetch(`${serviceUrl}/api/incidents`, { signal })
	]);
	if (!sessionResponse.ok || !incidentsResponse.ok) throw new Error('Service unavailable');
	const session = (await sessionResponse.json()) as { sessionUserId: string; users: User[] };
	const queue = (await incidentsResponse.json()) as { incidents: Incident[] };
	return { ...session, ...queue };
}

/** Claims an incident and returns either the accepted value or authoritative conflict value. */
export async function claimIncident(
	incidentId: string,
	actorId: string,
	expectedVersion: number,
	signal?: AbortSignal
) {
	const response = await fetch(`${serviceUrl}/api/incidents/${incidentId}/claim`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ actorId, expectedVersion }),
		signal
	});
	const payload = (await response.json()) as {
		incident?: Incident;
		error?: { current?: Incident; message?: string };
	};
	if (!response.ok && response.status !== 409)
		throw new Error(payload.error?.message ?? 'Unable to claim incident');
	return { status: response.status, ...payload };
}

/** Submits an idempotent comment and returns its authoritative incident. */
export async function submitComment(
	incidentId: string,
	actorId: string,
	body: string,
	clientMutationId: string,
	signal?: AbortSignal
) {
	const response = await fetch(`${serviceUrl}/api/incidents/${incidentId}/comments`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ actorId, body, clientMutationId }),
		signal
	});
	if (!response.ok) throw new Error('Comment was not accepted');
	return (await response.json()) as { incident: Incident };
}

/** Starts server analysis and returns the decoded queued job. */
export async function requestAnalysis(incidentId: string, signal?: AbortSignal) {
	const response = await fetch(`${serviceUrl}/api/incidents/${incidentId}/analysis`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: '{}',
		signal
	});
	if (!response.ok) throw new Error('Analysis was not accepted');
	return (await response.json()) as { job: AnalysisJob };
}
