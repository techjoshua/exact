/** User identity returned by the controlled service. */
export type User = { id: string; name: string };

/** Comment attached to an incident. */
export type IncidentComment = { id: string; authorId: string; body: string; createdAt: string };

/** Authoritative incident resource used by the comparison experience. */
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

/** Server analysis progress resource. */
export type AnalysisJob = {
	id: string;
	incidentId: string;
	status: 'queued' | 'running' | 'completed' | 'failed';
	result: { finding: string } | null;
};

/** Deterministic server snapshot used for SSR and immediate client adoption. */
export type InitialData = {
	incidents: Incident[];
	users: User[];
	sessionUserId: string;
};
