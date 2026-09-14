/** Task-system-owned settlement state read by consumers without awaiting completed work. */
export class ServerTaskReadiness {
	private readonly pending = new Set<Promise<unknown>>();
	private readonly identities?: WeakMap<Promise<unknown>, string | undefined>;
	private failure?: { error: unknown };
	private failures?: Map<string | undefined, { error: unknown }>;
	private selectedRevisions?: Map<string | undefined, number>;
	private revision = 0;

	/** Allocates identity lookup only for compiler plans that issue selected readiness queries. */
	constructor(trackIdentities = false) {
		if (trackIdentities) this.identities = new WeakMap();
	}

	/** Counts completed blocking activations so consumers can detect changes during publication. */
	get version(): number {
		return this.revision;
	}

	/** Observes already-started work; this boundary never invokes or schedules a task. */
	observe(settlement: Promise<unknown>, transitionId?: string): void {
		this.pending.add(settlement);
		this.identities?.set(settlement, transitionId);
		void settlement.then(
			() => {
				this.pending.delete(settlement);
				this.revision++;
				this.advanceSelectedRevision(transitionId);
			},
			(error) => {
				this.pending.delete(settlement);
				this.revision++;
				this.advanceSelectedRevision(transitionId);
				this.failure ??= { error };
				if (this.identities) {
					const failures = (this.failures ??= new Map());
					if (!failures.has(transitionId)) failures.set(transitionId, { error });
				}
			}
		);
	}

	/**
	 * Returns no wait for settled work, or waits for the currently pending selected activations.
	 * Omitted selection includes all work. Unidentified work always participates because no caller
	 * can prove it unrelated. Callers recheck after settlement to include subsequently issued work.
	 */
	wait(transitions?: ReadonlySet<string>): Promise<void> | undefined {
		if (!transitions) {
			if (this.failure) throw this.failure.error;
			if (!this.pending.size) return undefined;
			return Promise.all(this.pending).then(() => undefined);
		}
		if (!this.identities) throw new Error('Selected task readiness requires identity tracking');
		for (const [identity, failure] of this.failures ?? [])
			if (identity === undefined || transitions.has(identity)) throw failure.error;
		let selected: Promise<unknown>[] | undefined;
		for (const settlement of this.pending) {
			const identity = this.identities.get(settlement);
			if (identity === undefined || transitions.has(identity)) (selected ??= []).push(settlement);
		}
		return selected ? Promise.all(selected).then(() => undefined) : undefined;
	}

	/**
	 * Snapshots completion changes for compiler-selected identities. Tracking starts lazily on first
	 * use; the number is a request-local change token, not an absolute activation count. Unknown
	 * identities participate in every selection. Unrelated task completions do not change the token.
	 */
	versionFor(transitions: ReadonlySet<string>): number {
		if (!this.identities) throw new Error('Selected task readiness requires identity tracking');
		const revisions = (this.selectedRevisions ??= new Map());
		let version = revisions.get(undefined) ?? 0;
		for (const identity of transitions) version += revisions.get(identity) ?? 0;
		return version;
	}

	private advanceSelectedRevision(identity: string | undefined): void {
		const revisions = this.selectedRevisions;
		if (revisions) revisions.set(identity, (revisions.get(identity) ?? 0) + 1);
	}
}
