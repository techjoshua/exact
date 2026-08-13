import { createNativeIncidentService } from '../../../src/native-incident-service.mjs';
import type { AnalysisJob, Incident, NativeInitialData } from './contracts.js';

const service = createNativeIncidentService();

/** Returns the detached native-domain snapshot consumed during SSR or refresh. */
export function snapshot(): NativeInitialData {
	return service.snapshot();
}

/** Applies the native optimistic-concurrency claim. */
export function claim(id: string, actorId: string, expectedVersion: number): Incident {
	const result = service.claim(id, actorId, expectedVersion);
	if (result.incident) return result.incident;
	throw new Error(`incident ${result.conflict?.id ?? id} changed from the expected version`);
}

/** Converts the domain conflict exception into a serializable server-task result. */
export function claimResult(
	id: string,
	actorId: string,
	expectedVersion: number
): { incident: Incident | null; conflict: Incident | null } {
	return service.claim(id, actorId, expectedVersion);
}

/** Applies one idempotent native comment mutation. */
export function comment(id: string, actorId: string, body: string, mutationId: string): Incident {
	return service.comment(id, actorId, body, mutationId);
}

/** Starts deterministic asynchronous native analysis and publishes both progress transitions. */
export function analyze(id: string): AnalysisJob {
	return service.analyze(id);
}

/** Subscribes one response-owned listener to native domain changes. */
export function subscribe(listener: (event: { type: string; value: unknown }) => void) {
	return service.subscribe(listener);
}

/** Restores the native store and releases pending analysis work between benchmark scenarios. */
export function reset() {
	service.reset();
}
