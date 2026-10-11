import { nativeCallable, nativeReceiverKind } from '../internal/native-operations.js';
import { PendingCollectionMembers } from './pending-collection-members.js';
import {
	applyPendingNativeCollection,
	isPendingNativeCollectionSize
} from './pending-collections.js';
import {
	assertPendingPropertyAssignable,
	pendingArrayIndex,
	pendingPropertyKey,
	pendingInheritedRead,
	assertPendingWritable,
	assertPendingAccessorReceiver
} from './pending-property-policy.js';
import { PendingInvocationCells } from './pending-cells.js';
import { PendingHelperCalls } from './pending-helper-calls.js';
import {
	selectUnownedPendingMethod,
	readUnownedPendingProperty,
	writeUnownedPendingProperty,
	removeUnownedPendingProperty
} from './pending-unowned.js';
import { pendingPropertyDescriptor } from './pending-reflection.js';
import { applyNativeReactiveCollection } from '../proxy/collection-publication.js';
import { PendingCollectionDelta } from './collection-deltas.js';
import { unwrap } from '../internal/values.js';
import { PendingTransactionJournal, type PendingTransactionOptions } from './pending-journal.js';
import { PendingStatePublication } from './pending-publication.js';
import {
	applyPendingArray,
	createPendingArrayView,
	pendingArrayMutators,
	retainPendingArrayWrite
} from './pending-array.js';

import type { PendingReactiveTransaction } from './pending-state-contract.js';
export type { PendingReactiveState } from './pending-state-contract.js';

/**
 * Owns lazy pending cells and native collection deltas for one explicit transaction. Helper
 * facades belong to explicit helper invocations. Publication resolves reconciled owners.
 */
class InvocationState implements PendingReactiveTransaction {
	private readonly cells = new PendingInvocationCells();
	private readonly publication = new PendingStatePublication();
	private arrayViews?: WeakMap<object, unknown[]>;
	private collectionMembers?: PendingCollectionMembers;
	private helpers?: PendingHelperCalls;
	private readonly journal: PendingTransactionJournal;
	private readonly owned = new WeakSet<object>();

	constructor(
		private readonly root: object,
		private readonly options: PendingTransactionOptions
	) {
		this.owned.add(unwrap(root));
		this.publication.retainReceiver(root);
		this.journal = new PendingTransactionJournal(options, () => {
			this.cells.clear();
		});
	}

	commit(): void {
		try {
			this.journal.commit();
		} finally {
			this.publication.clearSelections();
		}
	}

	discard(): void {
		this.journal.discard();
		this.publication.clearSelections();
	}

	finishPublication(): void {
		this.journal.finishPublication();
		this.publication.clearSelections();
	}

	own<Value>(value: Value): Value {
		return this.adopt(value) as Value;
	}

	read(input: unknown, key: PropertyKey): unknown {
		if (input === null || input === undefined)
			throw new TypeError('Cannot read a nullish receiver');
		const target: object = Object(input);
		key = this.key(key);
		const raw = unwrap(target);
		if (!this.owned.has(raw)) return readUnownedPendingProperty(this, target, key);
		this.assertCurrent();
		const descriptor = pendingPropertyDescriptor(raw, key);
		if (
			key !== 'constructor' &&
			typeof descriptor?.value === 'function' &&
			(Array.isArray(raw) || raw instanceof Map || raw instanceof Set)
		) {
			this.collectionMembers ??= new PendingCollectionMembers();
			return this.collectionMembers.select(
				this,
				this.policyReceiver(target),
				key,
				descriptor.value
			);
		}
		if (descriptor?.get && !isPendingNativeCollectionSize(raw, key, descriptor.get)) {
			assertPendingAccessorReceiver(raw, key);
			return this.adopt(this.helper(descriptor.get, target)());
		}
		if (!this.journal.publishing) {
			const array = this.cells.arrays?.get(raw);
			if (key === 'length' && array) return array.length;
			const pending = this.cells.properties?.get(raw)?.get(key);
			if (pending)
				return this.adopt(pending.deleted ? pendingInheritedRead(target, key) : pending.value);
			const index = pendingArrayIndex(key);
			if (array && index !== undefined && index >= array.cutoff)
				return this.adopt(pendingInheritedRead(target, key));
			if (key === 'size') {
				const collection = this.cells.collections?.get(raw);
				if (collection) return collection.size;
			}
		}
		const value = Reflect.get(this.publication.resolve(this.policyReceiver(target)), key);
		return this.adopt(
			this.journal.publishing ? value : this.publication.retainChild(target, key, value)
		);
	}

	has(target: object, key: PropertyKey): boolean {
		key = this.key(key);
		const raw = unwrap(target);
		if (!this.owned.has(raw) || this.journal.publishing)
			return Reflect.has(this.publication.resolve(target), key);
		const pending = this.cells.properties?.get(raw)?.get(key);
		const index = pendingArrayIndex(key),
			array = this.cells.arrays?.get(raw);
		if (pending?.deleted || (!pending && array && index !== undefined && index >= array.cutoff)) {
			const prototype = Reflect.getPrototypeOf(raw);
			return prototype ? Reflect.has(prototype, key) : false;
		}
		return pending ? true : Reflect.has(target, key);
	}

	iterable<Value>(target: Value): Value {
		if (!target || typeof target !== 'object' || !this.owned.has(unwrap(target))) return target;
		const raw = unwrap(target);
		if (!(raw instanceof Map || raw instanceof Set || Array.isArray(raw))) return target;
		const selected = this.method(target, Symbol.iterator);
		return { [Symbol.iterator]: () => selected() } as Value;
	}

	write<Value>(target: object, key: PropertyKey, value: Value, data = false): Value {
		key = this.key(key);
		if (!this.owned.has(unwrap(target)))
			return writeUnownedPendingProperty(this.policyReceiver(target), key, value, this);
		this.assertCurrent();
		assertPendingWritable(this.policyReceiver(target), key);
		if (!data) assertPendingPropertyAssignable(unwrap(target), key);
		const descriptor = pendingPropertyDescriptor(unwrap(target), key);
		if (descriptor?.set && !data) {
			assertPendingAccessorReceiver(unwrap(target), key);
			this.helper(descriptor.set, target)(value);
			return value;
		}
		this.adopt(value);
		if (this.journal.publishing) {
			this.publication.write(this.policyReceiver(target), key, value);
			return value;
		}
		const raw = unwrap(target);
		let properties = this.cells.properties?.get(raw);
		if (!properties) (this.cells.properties ??= new WeakMap()).set(raw, (properties = new Map()));
		const storedValue = Array.isArray(raw)
			? retainPendingArrayWrite(this.cells, raw, key, value, properties)
			: value;
		const previous = properties.get(key);
		const reinserted = previous?.deleted || previous?.reinserted;
		if (previous?.deleted) properties.delete(key);
		properties.set(key, { value: storedValue, reinserted });
		const receiver = this.policyReceiver(target);
		this.journal.stage(() => {
			this.publication.write(receiver, key, storedValue);
		});
		return value;
	}

	key(value: unknown): PropertyKey {
		return pendingPropertyKey(value);
	}

	remove(target: object, key: PropertyKey): boolean {
		key = this.key(key);
		const raw = unwrap(target);
		if (!this.owned.has(raw)) return removeUnownedPendingProperty(this.policyReceiver(target), key);
		this.assertCurrent();
		assertPendingWritable(this.policyReceiver(target), key);
		if (Reflect.getOwnPropertyDescriptor(raw, key)?.configurable === false)
			throw new TypeError('Cannot delete a nonconfigurable task state property');
		if (this.journal.publishing) return this.publication.remove(this.policyReceiver(target), key);
		let properties = this.cells.properties?.get(raw);
		if (!properties) (this.cells.properties ??= new WeakMap()).set(raw, (properties = new Map()));
		properties.set(key, { value: undefined, deleted: true });
		const receiver = this.policyReceiver(target);
		this.journal.stage(() => {
			if (!this.publication.remove(receiver, key))
				throw new TypeError('Cannot delete task state property');
		});
		return true;
	}

	method(target: object, key: PropertyKey, selected?: unknown): (...args: unknown[]) => unknown {
		const raw = unwrap(target);
		if (!this.owned.has(raw))
			return selectUnownedPendingMethod(this.policyReceiver(target), key, selected, this);
		if (!(raw instanceof Map || raw instanceof Set || Array.isArray(raw)))
			throw new TypeError('Expected a native collection');
		selected ??= Reflect.get(raw, key, raw);
		const native = nativeCallable(nativeReceiverKind(raw)!, key);
		if (selected !== native || typeof native !== 'function') {
			throw new TypeError('Pending collection overrides are not supported');
		}
		return (...args) => {
			if (Array.isArray(raw)) {
				this.assertCurrent();
				if (pendingArrayMutators.has(key)) assertPendingWritable(this.policyReceiver(target), key);
				this.arrayViews ??= new WeakMap();
				let view = this.arrayViews.get(target);
				if (!view)
					this.arrayViews.set(target, (view = createPendingArrayView(this, target as unknown[])));
				return applyPendingArray(view, target as unknown[], key, native, args);
			}
			return applyPendingNativeCollection(this, target, raw, key, native, args);
		};
	}

	call(target: object, key: PropertyKey, args: unknown[]): unknown {
		return this.method(target, key)(...args);
	}

	collection(raw: Map<unknown, unknown> | Set<unknown>): PendingCollectionDelta {
		let delta = this.cells.collections?.get(raw);
		if (!delta)
			(this.cells.collections ??= new WeakMap()).set(
				raw,
				(delta = new PendingCollectionDelta(raw))
			);
		return delta;
	}

	publishedReceiver(target: object): object {
		return this.publication.resolve(target);
	}

	get publishing(): boolean {
		return this.journal.publishing;
	}

	checkCollectionWrite(target: object, key: PropertyKey): void {
		assertPendingWritable(this.policyReceiver(target), key);
	}

	stageCollectionWrite(target: object, key: PropertyKey, args: unknown[]): void {
		const receiver = this.policyReceiver(target);
		this.journal.stage(() => {
			applyNativeReactiveCollection(this.publication.resolve(receiver), key, args);
		});
	}

	private adopt(value: unknown): unknown {
		if (value && (typeof value === 'object' || typeof value === 'function')) {
			this.owned.add(unwrap(value));
			this.publication.retainReceiver(value);
		}
		return value;
	}

	helper(original: unknown, receiver?: unknown, inline = false): (...args: unknown[]) => unknown {
		this.helpers ??= new PendingHelperCalls();
		return this.helpers.select(this, original, receiver, inline);
	}

	optionalHelper(
		original: unknown,
		inline = false
	): ((...args: unknown[]) => unknown) | null | undefined {
		return original == null ? original : this.helper(original, undefined, inline);
	}

	/** Preserves the receiver of a native member selected earlier in this invocation. */
	isSelectedNativeMethod(value: unknown): value is (...args: unknown[]) => unknown {
		return this.collectionMembers?.has(value) ?? false;
	}

	helperMember(target: unknown, key: PropertyKey, inline = false): (...args: unknown[]) => unknown {
		if (
			!target ||
			(typeof target !== 'object' && typeof target !== 'function') ||
			!this.owned.has(unwrap(target))
		)
			return this.helper(this.read(target, key), target, inline);
		const receiver = unwrap(target);
		const descriptor = pendingPropertyDescriptor(receiver, key);
		if (
			this.owned.has(receiver) &&
			(Array.isArray(receiver) || receiver instanceof Map || receiver instanceof Set) &&
			typeof descriptor?.value === 'function'
		)
			return this.method(target, key, descriptor.value);
		return this.helper(this.read(receiver, key), target, inline);
	}

	view<Value>(value: Value, copy = false): Value {
		this.helpers ??= new PendingHelperCalls();
		return this.helpers.view(this, value, copy);
	}

	value<Value>(value: Value): Value {
		return this.helpers?.value(this, value) ?? value;
	}

	await<Value>(value: Value | PromiseLike<Value>): Promise<Value> {
		return this.options.await ? this.options.await(value) : Promise.resolve(value);
	}

	owns(value: object): boolean {
		return this.owned.has(unwrap(value)) || Boolean(this.options.owns?.(value, this.root));
	}

	retain(value: unknown): unknown {
		return this.adopt(value);
	}

	keys(target: object): (string | symbol)[] {
		return this.cells.keys(
			this.publication.resolve(target),
			unwrap(target),
			!this.journal.publishing
		);
	}

	descriptor(target: object, key: PropertyKey): PropertyDescriptor | undefined {
		return this.cells.descriptor(
			this.publication.resolve(target),
			unwrap(target),
			key,
			!this.journal.publishing
		);
	}

	assertCurrent(): void {
		this.journal.assertCurrent();
	}

	/** Preserves the caller-selected readonly or writable alias. */
	private policyReceiver(target: object): object {
		return target;
	}
}

/**
 * Holds touched reactive properties and collection deltas until explicit publication. Independent
 * transactions have independent pending views. Untouched storage is read live, without a snapshot.
 * Framework hosts can provide publication ordering and asynchronous ownership through options.
 * @internal
 */
export function createPendingReactiveTransaction(
	root: object,
	options: PendingTransactionOptions = {}
): PendingReactiveTransaction {
	options.assertCurrent?.();
	return new InvocationState(root, options);
}
