/** Private prototype of a compiler-issued target candidate. It does not expose DOM nodes. */
export interface TargetCandidate<T extends object> {
	readonly identity: symbol;
	readonly kind: 'intrinsic' | 'text' | 'fragment';
	readonly target: T;
}

/** A selection distinguishes a dormant explicit root from the absence of an explicit root. */
export type BoundTarget<T extends object> =
	| { readonly status: 'absent'; readonly generation: number }
	| { readonly status: 'dormant'; readonly generation: number }
	| {
			readonly status: 'ready';
			readonly generation: number;
			readonly candidate: TargetCandidate<T>;
	  };

type CandidateSlot<T extends object> = {
	eligible: boolean;
	candidate: TargetCandidate<T> | undefined;
};

/**
 * Private binding prototype: compiler-issued slots update only their own canonical namespace.
 * Reads use a retained selection; scalar updates do no discovery. Duplicate eligibility fails
 * before publication. Call publish once per structural transaction, after updating all slots.
 */
export class PrototypeTargetBindings<T extends object> {
	private readonly namespaces = new Map<string, Map<symbol, CandidateSlot<T>>>();
	private readonly selections = new Map<string, BoundTarget<T>>();
	private readonly dirty = new Set<string>();
	private fallback: TargetCandidate<T> | undefined;
	private readonly absent: BoundTarget<T> = Object.freeze({ status: 'absent', generation: 0 });
	private visited = 0;

	/** Stages one compiler-owned candidate; inactive candidates do not shadow fallback. */
	stage(namespace: string, slot: symbol, eligible: boolean, candidate?: TargetCandidate<T>): void {
		let slots = this.namespaces.get(namespace);
		if (!slots) this.namespaces.set(namespace, (slots = new Map()));
		const previous = slots.get(slot);
		if (previous?.eligible === eligible && previous.candidate === candidate) return;
		slots.set(slot, { eligible, candidate });
		this.dirty.add(namespace);
	}

	/** Releases a compiler-owned slot without keeping departed structural branches alive. */
	remove(namespace: string, slot: symbol): void {
		const slots = this.namespaces.get(namespace);
		if (!slots?.delete(slot)) return;
		if (!slots.size) this.namespaces.delete(namespace);
		this.dirty.add(namespace);
	}

	/** Stages the bounded fallback selected by the compiler's output path. */
	setFallback(candidate?: TargetCandidate<T>): void {
		if (this.fallback === candidate) return;
		this.fallback = candidate;
		for (const namespace of this.selections.keys()) this.dirty.add(namespace);
	}

	/** Resolves only changed namespaces and publishes all selections after successful validation. */
	publish(): void {
		const pending = new Map<string, BoundTarget<T>>();
		for (const namespace of this.dirty) pending.set(namespace, this.resolve(namespace));
		for (const [namespace, selection] of pending) this.selections.set(namespace, selection);
		this.dirty.clear();
	}

	/** Returns a retained target without scanning candidates after its first read. */
	read(namespace: string): BoundTarget<T> {
		if (!this.selections.has(namespace)) this.dirty.add(namespace);
		if (this.dirty.has(namespace)) this.publish();
		return this.selections.get(namespace) ?? this.absent;
	}

	/** Reports candidate visits for prototype work-count assertions and benchmarks. */
	get candidateVisits(): number {
		return this.visited;
	}

	/** Releases request/component-owned candidate and result references. */
	dispose(): void {
		this.namespaces.clear();
		this.selections.clear();
		this.dirty.clear();
		this.fallback = undefined;
	}

	private resolve(namespace: string): BoundTarget<T> {
		let explicit: CandidateSlot<T> | undefined;
		for (const slot of this.namespaces.get(namespace)?.values() ?? []) {
			this.visited++;
			if (!slot.eligible) continue;
			if (explicit) throw new Error(`Multiple active enhancement roots for ${namespace}`);
			explicit = slot;
		}
		const candidate = explicit ? explicit.candidate : this.fallback;
		const status = candidate ? 'ready' : explicit ? 'dormant' : 'absent';
		const previous = this.selections.get(namespace) ?? this.absent;
		if (
			previous.status === status &&
			(previous.status !== 'ready' ||
				(previous.candidate.identity === candidate?.identity &&
					previous.candidate.target === candidate.target &&
					previous.candidate.kind === candidate.kind))
		)
			return previous;
		const generation = previous.generation + 1;
		return candidate
			? Object.freeze({ status: 'ready', generation, candidate })
			: Object.freeze({ status: status as 'dormant' | 'absent', generation });
	}
}
