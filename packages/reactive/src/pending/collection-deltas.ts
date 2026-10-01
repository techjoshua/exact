import { unwrap } from '../internal/values.js';

/** One pending key retains membership, value and whether it follows committed iteration entries. */
interface PendingEntry {
	present: boolean;
	value: unknown;
	appended: boolean;
}

/**
 * An invocation's native Map or Set edits, without copying committed storage.
 * Key reads and edits cost O(1). Size costs O(pending keys), and iteration visits committed
 * and pending entries. The original collection remains untouched until publication.
 */
export class PendingCollectionDelta {
	private readonly entries = new Map<unknown, PendingEntry>();
	private cleared = false;

	/** Retains the native receiver whose current committed storage supplies untouched keys. */
	constructor(private readonly target: Map<unknown, unknown> | Set<unknown>) {}

	/** Distinguishes pending values from committed values that still need normal reactive wrapping. */
	hasPending(input: unknown): boolean {
		return this.cleared || this.entries.has(unwrap(input));
	}

	/** Reads membership after this invocation's ordered edits. */
	has(input: unknown): boolean {
		const key = unwrap(input);
		return this.entries.get(key)?.present ?? (!this.cleared && this.committedHas(key));
	}

	/** Reads a Map value after this invocation's ordered edits. */
	get(input: unknown): unknown {
		const key = unwrap(input);
		const entry = this.entries.get(key);
		if (entry) return entry.present ? entry.value : undefined;
		return this.cleared ? undefined : Map.prototype.get.call(this.target, key);
	}

	/** Records an insertion or replacement while preserving native insertion order. */
	set(input: unknown, value: unknown): void {
		const key = unwrap(input);
		const previous = this.entries.get(key);
		const present = this.has(key);
		const appended = previous?.appended ?? (this.cleared || !this.committedHas(key));
		// A deleted key joins the end on reinsertion, including deletion of a committed key.
		if (!present) this.entries.delete(key);
		this.entries.set(key, { present: true, value, appended: !present || appended });
	}

	/** Records deletion and returns the native boolean result without changing committed storage. */
	delete(input: unknown): boolean {
		const key = unwrap(input);
		const present = this.has(key);
		this.entries.set(key, { present: false, value: undefined, appended: false });
		return present;
	}

	/** Makes earlier committed and pending entries absent in this invocation. */
	clear(): void {
		this.cleared = true;
		this.entries.clear();
	}

	/** Includes current committed membership for keys this invocation has not replaced. */
	get size(): number {
		let size = this.cleared
			? 0
			: (Reflect.get(
					this.target instanceof Map ? Map.prototype : Set.prototype,
					'size',
					this.target
				) as number);
		for (const [key, entry] of this.entries) {
			const committed = !this.cleared && this.committedHas(key);
			if (entry.present && !committed) size++;
			if (!entry.present && committed) size--;
		}
		return size;
	}

	/** Iterates the pending native order, retaining changes made while the iterator is active. */
	*iterate(
		wrap: (value: unknown) => unknown = (value) => value
	): IterableIterator<[unknown, unknown]> {
		if (!this.cleared) {
			const committed =
				this.target instanceof Map
					? Map.prototype.entries.call(this.target)
					: Set.prototype.entries.call(this.target);
			for (const [key, value] of committed) {
				if (this.cleared) break;
				const entry = this.entries.get(key);
				if (!entry) yield [wrap(key), wrap(value)];
				else if (entry.present && !entry.appended) yield [wrap(key), wrap(entry.value)];
			}
		}
		for (const [key, entry] of this.entries)
			if (entry.present && entry.appended) yield [wrap(key), wrap(entry.value)];
	}

	private committedHas(key: unknown): boolean {
		return this.target instanceof Map
			? Map.prototype.has.call(this.target, key)
			: Set.prototype.has.call(this.target, key);
	}
}
