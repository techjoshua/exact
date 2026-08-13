import type { AnalysisJob, Incident, IncidentFixture } from '../../../src/incident-store.mjs';

export type { AnalysisJob, Incident };

/** Native server snapshot passed through progressive SSR into the durable workspace. */
export type NativeInitialData = Pick<IncidentFixture, 'incidents' | 'users' | 'sessionUserId'>;

/** Durable workspace state shared by compiler-generated render and server-task operations. */
export type WorkspaceState = NativeInitialData & {
	selectedId: string;
	severity: string;
	status: string;
	draft: string;
	conflict: string;
	error: string;
	job: AnalysisJob | null;
	busy: boolean;
	viewedIncidentId: string;
	viewedVersion: number;
};
