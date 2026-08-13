import type { AnalysisJob, Incident, IncidentFixture } from '../../../src/incident-store.mjs';

export type { AnalysisJob, Incident };

/** Serializable loader data for one native React route. */
export type WorkspaceLoaderData = Pick<IncidentFixture, 'incidents' | 'users' | 'sessionUserId'> & {
	selectedId: string;
};

/** Serializable result returned by the participant's intent-based route action. */
export type WorkspaceActionData = {
	intent: 'claim' | 'comment' | 'analyze';
	incident?: Incident | null;
	conflict?: Incident | null;
	job?: AnalysisJob;
	error?: string;
};
