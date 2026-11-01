import { isReactive, unwrap } from '../internal/values.js';
import { writeReactiveLazy } from '../writes.js';
import { wrapReactiveCollectionValue } from '../proxy/create-base.js';

/** Consumed native positions use their real keys, independently of object property edges. */
type SelectedCollectionMembers = Map<unknown, { key?: object; values?: Set<object> }>;

/** Associates selected pending storage with reactive receivers used to publish its mutations. */
export class PendingStatePublication {
	private readonly receivers = new WeakMap<object, object>();
	private children?: WeakMap<object, Map<PropertyKey, object>>;
	private members?: WeakMap<object, SelectedCollectionMembers>;
	private association?: Array<[object, object]>;

	/** Retains only selected data-property paths, without traversing untouched replacement storage. */
	retainChild(parent: object, key: PropertyKey, child: unknown): unknown {
		if (!child || typeof child !== 'object') return child;
		const raw = unwrap(parent);
		const descriptor = Reflect.getOwnPropertyDescriptor(raw, key);
		if (!descriptor || !('value' in descriptor) || unwrap(descriptor.value) !== unwrap(child))
			return child;
		this.retainReceiver(parent);
		let children = this.children?.get(raw);
		if (!children) (this.children ??= new WeakMap()).set(raw, (children = new Map()));
		children.set(key, unwrap(child));
		const selected = Reflect.get(this.receivers.get(raw) ?? parent, key);
		if (selected && typeof selected === 'object') this.retainSelectedTree(unwrap(child), selected);
		return child;
	}

	/**
	 * Retains distinct consumed native key/value storage for later receiver acquisition. Association
	 * checks committed membership, including intermediate ordered publications. Acquired receivers
	 * survive detachment. External removal before acquisition cannot grant new ownership.
	 */
	retainCollectionMember(parent: object, key: unknown, value: unknown, keyMember = false): unknown {
		if (!value || typeof value !== 'object') return value;
		const raw = unwrap(parent);
		this.retainReceiver(parent);
		let members = this.members?.get(raw);
		if (!members) (this.members ??= new WeakMap()).set(raw, (members = new Map()));
		let entry = members.get(key);
		if (!entry) members.set(key, (entry = {}));
		if (keyMember) entry.key = unwrap(value);
		else (entry.values ??= new Set()).add(unwrap(value));
		this.retainSelectedTree(unwrap(value), value);
		return value;
	}

	/** Associates consumed members after a successful native mutation exposes its ordered storage. */
	associateCollection(parent: object): void {
		const raw = unwrap(parent);
		if (this.members?.has(raw)) this.retainSelectedTree(raw, this.resolve(parent));
	}

	/** Releases selection relationships after their owner finishes publication or rejects the transaction. */
	clearSelections(): void {
		this.children = undefined;
		this.members = undefined;
	}

	/** Associates an acquired reactive alias and its selected descendants before any publication. */
	retainReceiver(value: object): void {
		if (!isReactive(value)) return;
		const raw = unwrap(value);
		if (this.receivers.has(raw)) return;
		this.receivers.set(raw, value);
		if (this.children?.has(raw) || this.members?.has(raw)) this.retainSelectedTree(raw, value);
	}
	/** Resolves a retained reactive receiver without changing the selected storage. */
	resolve(target: object): object {
		if (isReactive(target)) return target;
		return this.receivers.get(unwrap(target)) ?? target;
	}

	/** Publishes once to shared storage, preserving an explicitly selected reactive receiver. */
	write(target: object, key: PropertyKey, value: unknown): void {
		this.publishOwnerWrite(this.resolve(target), key, value);
	}

	private publishOwnerWrite(owner: object, key: PropertyKey, value: unknown): void {
		writeReactiveLazy(owner, [key], () => value);
		if (!value || typeof value !== 'object') return;
		const stored = Reflect.get(owner, key);
		if (!stored || typeof stored !== 'object') return;
		// A raw property publication can precede attachment of its parent to a reactive owner.
		this.retainChild(owner, key, value);
		this.retainSelectedTree(unwrap(value), stored);
	}

	/**
	 * Associates selected properties and native members without scanning untouched storage.
	 * Receiver acquisition and edge selection both establish association, independently of journal order.
	 * Each traversal visits raw storage and its first retained reactive receiver at most once each,
	 * bounding cycles even if raw storage is seen first.
	 * Work and queue storage are O(V + E) in reachable selected or written properties and consumed
	 * native positions per traversal.
	 * Reentrant acquisition joins the active queue instead of recursively traversing the graph.
	 */
	private retainSelectedTree(source: object, owner: object): void {
		if (this.association) {
			this.association.push([source, owner]);
			return;
		}
		const queue: Array<[object, object]> = [[source, owner]];
		const visited = new Set<object>();
		this.association = queue;
		try {
			for (let index = 0; index < queue.length; index++) {
				const [raw, stored] = queue[index]!;
				// A setter may store a different value. It cannot transfer the RHS storage's authority.
				if (unwrap(stored) !== raw) continue;
				if (isReactive(stored) && !this.receivers.has(raw)) this.receivers.set(raw, stored);
				const receiver = this.receivers.get(raw) ?? stored;
				if (visited.has(receiver)) continue;
				visited.add(receiver);
				for (const [key, entry] of this.members?.get(raw) ?? []) {
					const present =
						raw instanceof Map
							? Map.prototype.has.call(raw, key)
							: Set.prototype.has.call(raw, key);
					if (!present) continue;
					if (entry.key)
						queue.push([entry.key, wrapReactiveCollectionValue(receiver, entry.key) as object]);
					const value = unwrap(raw instanceof Map ? Map.prototype.get.call(raw, key) : key);
					if (value && typeof value === 'object' && entry.values?.has(value))
						queue.push([value, wrapReactiveCollectionValue(receiver, value) as object]);
				}
				for (const [key, child] of this.children?.get(raw) ?? []) {
					const input = Reflect.getOwnPropertyDescriptor(raw, key);
					if (!input || !('value' in input) || unwrap(input.value) !== child) continue;
					const selected = Reflect.get(receiver, key);
					if (selected && typeof selected === 'object') queue.push([child, selected]);
				}
			}
		} finally {
			this.association = undefined;
		}
	}

	/** Deletes from the selected storage through its retained reactive receiver. */
	remove(target: object, key: PropertyKey): boolean {
		return Reflect.deleteProperty(this.resolve(target), key);
	}
}
