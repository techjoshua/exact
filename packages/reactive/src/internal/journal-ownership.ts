/** Per-property mutation versions retained by one optimistic journal. */
export type JournalVersions = Map<object, Map<PropertyKey, number>>;

/** Keeps physical restoration errors primary across the entire ownership drain. */
export type JournalRestorationOutcome = {
	readonly restorationFailed: boolean;
	readonly restorationError: unknown;
	readonly secondaryFailed: boolean;
	readonly secondaryError: unknown;
};

/** An optimistic layer and the older layers its inverse can expose. */
export interface JournalOwnership {
	rejected: boolean;
	committed: boolean;
	versions: JournalVersions;
	previous: Map<object, Map<PropertyKey, JournalOwnership>>;
	restore(): JournalRestorationOutcome;
	release(): void;
	dependents: number;
	released: boolean;
}

const pendingRestores = new Set<JournalOwnership>();
const pendingReleases = new Set<JournalOwnership>();
let draining = false;

const latest = new WeakMap<object, Map<PropertyKey, WeakRef<JournalOwnership>>>();

/** Links a new journal only to uninterrupted optimistic predecessors, never ordinary writes. */
export function retainJournalOwnership(
	versions: JournalVersions,
	ranges: ReadonlyMap<object, ReadonlyMap<PropertyKey, { start: number; end: number }>>,
	restore: () => JournalRestorationOutcome,
	release: () => void
): JournalOwnership {
	const owner: JournalOwnership = {
		rejected: false,
		committed: false,
		versions,
		previous: new Map(),
		restore,
		release,
		dependents: 0,
		released: false
	};
	for (const [target, entries] of ranges) {
		let current = latest.get(target);
		if (!current) latest.set(target, (current = new Map()));
		for (const [key, range] of entries) {
			const predecessor = current.get(key)?.deref();
			if (
				predecessor &&
				!predecessor.committed &&
				!predecessor.released &&
				predecessor.versions.get(target)?.get(key) === range.start
			) {
				let previous = owner.previous.get(target);
				if (!previous) owner.previous.set(target, (previous = new Map()));
				previous.set(key, predecessor);
				predecessor.dependents++;
			}
			current.set(key, new WeakRef(owner));
		}
	}
	return owner;
}

/** Transfers restored properties to their predecessors and removes already-rejected older layers. */
export function restoreJournalPredecessors(
	owner: JournalOwnership,
	restored: ReadonlyMap<object, ReadonlySet<PropertyKey>>,
	readVersion: (target: object, key: PropertyKey) => number
): void {
	for (const [target, keys] of restored) {
		const current = latest.get(target);
		for (const key of keys) {
			if (current?.get(key)?.deref() !== owner) continue;
			const predecessor = owner.previous.get(target)?.get(key);
			owner.previous.get(target)?.delete(key);
			if (predecessor) {
				predecessor.dependents--;
				pendingReleases.add(predecessor);
			}
			if (!predecessor || predecessor.committed || predecessor.released) {
				current.delete(key);
				continue;
			}
			predecessor.versions.get(target)!.set(key, readVersion(target, key));
			current.set(key, new WeakRef(predecessor));
			if (predecessor.rejected) pendingRestores.add(predecessor);
		}
	}
}

/** Commits the layer and releases inverse ancestry that must never be rolled back through it. */
export function commitJournalOwnership(owner: JournalOwnership): void {
	owner.committed = true;
	pendingReleases.add(owner);
	clearLatest(owner);
	drainOwnership();
}

/** Rejects a layer and restores newly uncovered rejected predecessors without recursive calls. */
export function rollbackJournalOwnership(owner: JournalOwnership): void {
	owner.rejected = true;
	pendingRestores.add(owner);
	drainOwnership();
}

/** Makes a failed residual terminal before publication can reenter the journal graph. */
export function retireFailedJournalRestoration(owner: JournalOwnership): (() => void) | undefined {
	if (owner.released) return;
	owner.released = true;
	pendingRestores.delete(owner);
	pendingReleases.delete(owner);
	clearLatest(owner);
	detachPredecessors(owner);
	return owner.release;
}

function clearLatest(owner: JournalOwnership): void {
	for (const [target, keys] of owner.versions) {
		const current = latest.get(target);
		for (const key of keys.keys()) if (current?.get(key)?.deref() === owner) current.delete(key);
	}
}

function detachPredecessors(owner: JournalOwnership): void {
	for (const previous of owner.previous.values())
		for (const predecessor of previous.values()) {
			predecessor.dependents--;
			pendingReleases.add(predecessor);
		}
	owner.previous.clear();
}

/** Settles both queues to a fixed point, trying every owned cleanup before selecting an error. */
function drainOwnership(): void {
	if (draining) return;
	draining = true;
	let restorationFailed = false;
	let restorationError: unknown;
	let secondaryFailed = false;
	let secondaryError: unknown;
	const secondary = (error: unknown) => {
		if (!secondaryFailed) {
			secondaryFailed = true;
			secondaryError = error;
		}
	};
	try {
		while (pendingRestores.size || pendingReleases.size) {
			while (pendingRestores.size) {
				const owner = pendingRestores.values().next().value!;
				pendingRestores.delete(owner);
				if (owner.released) continue;
				const outcome = owner.restore();
				if (outcome.restorationFailed && !restorationFailed) {
					restorationFailed = true;
					restorationError = outcome.restorationError;
				}
				if (outcome.secondaryFailed) secondary(outcome.secondaryError);
				if (!owner.released) pendingReleases.add(owner);
			}
			while (pendingReleases.size) {
				const owner = pendingReleases.values().next().value!;
				pendingReleases.delete(owner);
				if (owner.released || (!owner.committed && (!owner.rejected || owner.dependents))) continue;
				// Claim and detach before authored cleanup. A reentrant successor cannot revive this layer.
				const release = retireFailedJournalRestoration(owner);
				try {
					release?.();
				} catch (error) {
					secondary(error);
				}
			}
		}
	} finally {
		draining = false;
	}
	if (restorationFailed) throw restorationError;
	if (secondaryFailed) throw secondaryError;
}
