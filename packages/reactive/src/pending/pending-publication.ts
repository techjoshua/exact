import { isReactive, unwrap } from '../internal/values.js';
import { writeReactiveLazy } from '../writes.js';
import { reactiveProxyOptions } from '../proxy/collection-publication.js';

interface PublishedOwners {
	first: object;
	additional?: object[];
}

/** Retains every published owner created when assignments reconcile one pending source reference. */
export class PendingStatePublication {
	private readonly published = new WeakMap<object, PublishedOwners>();
	private children?: WeakMap<object, Map<PropertyKey, object>>;

	/** Retains only selected data-property paths, without traversing untouched replacement storage. */
	retainChild(parent: object, key: PropertyKey, child: unknown): unknown {
		if (!child || typeof child !== 'object') return child;
		const raw = unwrap(parent);
		const descriptor = Reflect.getOwnPropertyDescriptor(raw, key);
		if (!descriptor || !('value' in descriptor) || unwrap(descriptor.value) !== unwrap(child))
			return child;
		let children = this.children?.get(raw);
		if (!children) (this.children ??= new WeakMap()).set(raw, (children = new Map()));
		children.set(key, unwrap(child));
		return child;
	}

	/** Releases selection relationships after their owner finishes publication or rejects the transaction. */
	clearSelections(): void {
		this.children = undefined;
	}

	/** Keeps writable reactive aliases for publication without promoting a reader's readonly policy. */
	retainReceiver(value: object): void {
		if (!isReactive(value) || reactiveProxyOptions(value)?.readonly) return;
		const raw = unwrap(value);
		if (!this.published.has(raw)) this.published.set(raw, { first: value });
	}
	/** Reads the first retained owner while publication drains. */
	resolve(target: object): object {
		if (isReactive(target)) return target;
		return this.published.get(unwrap(target))?.first ?? target;
	}

	/** A source replacement can feed several independently retained object or Array owners. */
	write(target: object, key: PropertyKey, value: unknown): void {
		const owners = this.published.get(unwrap(target));
		this.publishOwnerWrite(this.selectedOwner(target, owners), key, value);
		if (owners?.additional)
			for (const owner of owners.additional) this.publishOwnerWrite(owner, key, value);
	}

	/** Preserves an explicit writer alias while retaining replacement owners created by reconciliation. */
	private selectedOwner(target: object, owners: PublishedOwners | undefined): object {
		return isReactive(target) && (!owners || unwrap(owners.first) === unwrap(target))
			? target
			: (owners?.first ?? target);
	}

	private publishOwnerWrite(owner: object, key: PropertyKey, value: unknown): void {
		writeReactiveLazy(owner, [key], () => value);
		if (!value || typeof value !== 'object') return;
		const stored = Reflect.get(owner, key);
		if (!stored || typeof stored !== 'object') return;
		this.retainPublishedTree(unwrap(value), stored);
	}

	/** Maps touched descendant aliases at the reconciliation that first publishes them, before later replacement. */
	private retainPublishedTree(source: object, owner: object): void {
		const queue: Array<[object, object]> = [[source, owner]];
		for (let index = 0; index < queue.length; index++) {
			const [raw, stored] = queue[index]!;
			const previous = this.published.get(raw);
			if (
				previous &&
				(unwrap(previous.first) === unwrap(stored) ||
					previous.additional?.some((target) => unwrap(target) === unwrap(stored)))
			)
				continue;
			if (!previous) this.published.set(raw, { first: stored });
			else (previous.additional ??= []).push(stored);
			for (const [key, child] of this.children?.get(raw) ?? []) {
				const input = Reflect.getOwnPropertyDescriptor(raw, key);
				const destination = Reflect.getOwnPropertyDescriptor(unwrap(stored), key);
				if (
					!input ||
					!('value' in input) ||
					unwrap(input.value) !== child ||
					!destination ||
					!('value' in destination)
				)
					continue;
				const selected = Reflect.get(stored, key);
				if (selected && typeof selected === 'object') queue.push([child, selected]);
			}
		}
	}

	/** Deletes from all retained owners of the pending source reference. */
	remove(target: object, key: PropertyKey): boolean {
		const owners = this.published.get(unwrap(target));
		let success = Reflect.deleteProperty(this.selectedOwner(target, owners), key);
		if (owners?.additional)
			for (const owner of owners.additional)
				success = Reflect.deleteProperty(owner, key) && success;
		return success;
	}
}
