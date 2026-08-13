/** Error carrying the authoritative incident after an optimistic concurrency conflict. */
export class IncidentConflictError extends Error {
	readonly current: Incident;
}

/** Error representing invalid domain input. */
export class DomainInputError extends Error {}
/** Error representing an unknown domain resource. */
export class DomainNotFoundError extends Error {}

/** One immutable response-log entry. */
export type IncidentComment = {
	id: string;
	authorId: string;
	body: string;
	createdAt: string;
};

/** One incident resource exposed to comparison participants. */
export type Incident = {
	id: string;
	title: string;
	severity: 'critical' | 'high' | 'medium' | 'low';
	status: 'open' | 'investigating' | 'closed';
	ownerId: string | null;
	version: number;
	updatedAt: string;
	comments: IncidentComment[];
};

/** One asynchronous server-analysis resource. */
export type AnalysisJob = {
	id: string;
	incidentId: string;
	status: 'queued' | 'running' | 'completed' | 'failed';
	result: null | { finding: string };
};

/** Canonical deterministic fixture owned by the comparison service. */
export type IncidentFixture = {
	schemaVersion: number;
	sessionUserId: string;
	users: Array<{ id: string; name: string }>;
	incidents: Incident[];
	jobs: AnalysisJob[];
};

/** In-memory implementation of the shared comparison-domain contract. */
export class IncidentStore {
	/** Creates a store from a fixture and optional deterministic clock. */
	constructor(fixture: IncidentFixture, options?: { now?: () => string });
	/** Restores the baseline, optionally with an empty incident collection. */
	reset(options?: { empty?: boolean }): void;
	/** Returns a detached complete fixture snapshot. */
	snapshot(): IncidentFixture;
	/** Returns detached incidents in canonical severity order. */
	listIncidents(): Incident[];
	/** Returns one detached incident when it exists. */
	getIncident(id: string): Incident | undefined;
	/** Claims an incident when its version still matches. */
	claimIncident(id: string, actorId: string, expectedVersion: number): Incident;
	/** Adds an idempotent comment mutation. */
	addComment(
		id: string,
		actorId: string,
		body: string,
		clientMutationId: string
	): { comment: IncidentComment; incident: Incident };
	/** Creates a queued analysis job. */
	startAnalysis(id: string): AnalysisJob;
	/** Advances an existing analysis job and publishes the result. */
	advanceJob(
		id: string,
		status: AnalysisJob['status'],
		result?: AnalysisJob['result']
	): AnalysisJob;
	/** Returns one detached analysis job when it exists. */
	getJob(id: string): AnalysisJob | undefined;
	/** Subscribes to accepted resource changes. */
	subscribe(listener: (event: { type: string; value: unknown }) => void): () => void;
}
