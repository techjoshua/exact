import { sameDependencyKey } from './property-key.js';

type SingleVersion = { key: PropertyKey; version: number };

/** Retains dependency generations weakly, promoting single-key targets only when another key appears. */
export class KeyedVersionStore {
	private readonly targets = new WeakMap<object, SingleVersion | Map<PropertyKey, number>>();

	/** Reads a generation without allocating storage or retaining the target. */
	get(target: object, key: PropertyKey): number {
		const entry = this.targets.get(target);
		return entry instanceof Map
			? (entry.get(key) ?? 0)
			: entry && sameDependencyKey(entry.key, key)
				? entry.version
				: 0;
	}

	/** Records a generation, preserving other keys when a single-key target becomes multi-key. */
	set(target: object, key: PropertyKey, version: number): void {
		const entry = this.targets.get(target);
		if (!entry) this.targets.set(target, { key, version });
		else if (entry instanceof Map) entry.set(key, version);
		else if (sameDependencyKey(entry.key, key)) entry.version = version;
		else {
			const versions = new Map<PropertyKey, number>();
			versions.set(entry.key, entry.version);
			versions.set(key, version);
			this.targets.set(target, versions);
		}
	}

	/** Retains an observed key at generation zero unless it already has a generation. */
	retain(target: object, key: PropertyKey): number {
		const entry = this.targets.get(target);
		if (!entry) {
			this.targets.set(target, { key, version: 0 });
			return 0;
		}
		if (entry instanceof Map) {
			if (!entry.has(key)) entry.set(key, 0);
			return entry.get(key)!;
		}
		if (sameDependencyKey(entry.key, key)) return entry.version;
		this.set(target, key, 0);
		return 0;
	}

	/** Reports whether the target has retained generation storage. */
	has(target: object): boolean {
		return this.targets.has(target);
	}

	/** Visits retained keys in insertion order, including unchanged observed keys. */
	keys(target: object): Iterable<PropertyKey> {
		const entry = this.targets.get(target);
		return entry instanceof Map ? entry.keys() : entry ? [entry.key] : [];
	}
}
