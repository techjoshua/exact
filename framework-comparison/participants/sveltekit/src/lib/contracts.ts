/** User identity supplied by the deterministic comparison fixture. */
export type User = { id: string; name: string };

/** Authored response-log entry attached to an incident. */
export type IncidentComment = {
	id: string;
	authorId: string;
	body: string;
	createdAt: string;
};

/** Authoritative incident resource consumed by the participant UI. */
export type Incident = {
	id: string;
	title: string;
	severity: 'critical' | 'high' | 'medium' | 'low';
	status: string;
	ownerId: string | null;
	version: number;
	comments: IncidentComment[];
};

/** Asynchronous server-analysis state published through the event stream. */
export type AnalysisJob = {
	id: string;
	status: string;
	result: null | { finding: string };
};

/** Server-loaded data used for initial SSR and hydration. */
export type InitialData = {
	incidents: Incident[];
	users: User[];
	sessionUserId: string;
	path: string;
};
