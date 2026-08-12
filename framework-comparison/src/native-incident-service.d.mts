import type { AnalysisJob, Incident, IncidentFixture } from './incident-store.mjs';

/** Shared domain service used by isolated native-full-stack participant servers. */
export type NativeIncidentService = {
	/** Returns the server-renderable application snapshot. */
	snapshot(): Pick<IncidentFixture, 'incidents' | 'users' | 'sessionUserId'>;
	/** Applies a claim and reports an authoritative version conflict as data. */
	claim(
		id: string,
		actorId: string,
		expectedVersion: number
	): { incident: Incident | null; conflict: Incident | null };
	/** Applies one idempotent comment mutation. */
	comment(id: string, actorId: string, body: string, mutationId: string): Incident;
	/** Starts deterministic asynchronous server analysis. */
	analyze(id: string): AnalysisJob;
	/** Subscribes a response-owned listener to resource changes. */
	subscribe(listener: (event: { type: string; value: unknown }) => void): () => void;
	/** Restores the canonical fixture, optionally without incidents. */
	reset(options?: { empty?: boolean }): void;
};

/** Creates an isolated native-full-stack service over the canonical comparison domain. */
export function createNativeIncidentService(): NativeIncidentService;
