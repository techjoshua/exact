/** Per-property mutation versions retained by one optimistic journal. */
export type JournalVersions = Map<object, Map<PropertyKey, number>>;

/** An optimistic layer and the older layers its inverse can expose. */
export interface JournalOwnership {
	rejected: boolean;
	committed: boolean;
	versions: JournalVersions;
	previous: Map<object, Map<PropertyKey, JournalOwnership>>;
	restore(): void;
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
	restore: () => void,
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
			if (!predecessor || predecessor.committed) {
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
	drainOwnership();
	for (const [target, keys] of owner.versions) {
		const current = latest.get(target);
		for (const key of keys.keys()) if (current?.get(key)?.deref() === owner) current.delete(key);
	}
}

/** Rejects a layer and restores newly uncovered rejected predecessors without recursive calls. */
export function rollbackJournalOwnership(owner: JournalOwnership): void {
	owner.rejected = true;
	pendingRestores.add(owner);
	drainOwnership();
}

/** Releases settled inverse captures once no live successor can expose them again. */
function drainOwnership(): void {
	if (draining) return;
	draining = true;
	try {
		while (pendingRestores.size) {
			const owner = pendingRestores.values().next().value!;
			pendingRestores.delete(owner);
			owner.restore();
			pendingReleases.add(owner);
		}
		while (pendingReleases.size) {
			const owner = pendingReleases.values().next().value!;
			pendingReleases.delete(owner);
			if (owner.released || (!owner.committed && (!owner.rejected || owner.dependents))) continue;
			owner.released = true;
			owner.release();
			for (const previous of owner.previous.values())
				for (const predecessor of previous.values()) {
					predecessor.dependents--;
					pendingReleases.add(predecessor);
				}
			owner.previous.clear();
		}
	} finally {
		draining = false;
	}
}
