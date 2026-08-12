import fixture from '../fixtures/baseline.json' with { type: 'json' };
import { IncidentConflictError, IncidentStore } from './incident-store.mjs';

/** Creates an isolated native-full-stack service over the canonical comparison domain. */
export function createNativeIncidentService() {
	const store = new IncidentStore(fixture);
	const timers = new Set();
	const schedule = (callback, delay) => {
		const timer = setTimeout(() => {
			timers.delete(timer);
			callback();
		}, delay);
		timer.unref?.();
		timers.add(timer);
	};
	return {
		/** Returns the server-renderable application snapshot. */
		snapshot() {
			const value = store.snapshot();
			return {
				incidents: store.listIncidents(),
				users: value.users,
				sessionUserId: value.sessionUserId
			};
		},
		/** Applies a claim and converts version conflicts to transport data. */
		claim(id, actorId, expectedVersion) {
			try {
				return {
					incident: store.claimIncident(id, actorId, expectedVersion),
					conflict: null
				};
			} catch (caught) {
				if (caught instanceof IncidentConflictError)
					return { incident: null, conflict: caught.current };
				throw caught;
			}
		},
		/** Applies one idempotent comment mutation. */
		comment(id, actorId, body, mutationId) {
			return store.addComment(id, actorId, body, mutationId).incident;
		},
		/** Starts deterministic asynchronous server analysis. */
		analyze(id) {
			const job = store.startAnalysis(id);
			schedule(() => store.advanceJob(job.id, 'running'), 25);
			schedule(
				() => store.advanceJob(job.id, 'completed', { finding: 'Correlated upstream failures' }),
				50
			);
			return job;
		},
		/** Subscribes a response-owned listener to resource changes. */
		subscribe(listener) {
			return store.subscribe(listener);
		},
		/** Restores the fixture and releases pending analysis work. */
		reset(options = {}) {
			for (const timer of timers) clearTimeout(timer);
			timers.clear();
			store.reset(options);
		}
	};
}
