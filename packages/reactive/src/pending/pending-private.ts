import { unwrap } from '../internal/values.js';
import { notifyReactivePrivateWrite } from '../proxy/collection-publication.js';
import { restoreReactiveAccessorWrite } from '../proxy/accessor-dependencies.js';
import { hasActiveTransaction, recordTransactionUndo } from '../internal/deps.js';

import type { PendingStatePublication } from './pending-publication.js';

/** Compiler tokens address private fields without exposing names or replacing branded receivers. */
export class PendingPrivateState {
	private values?: WeakMap<object, Map<object, unknown>>;

	/** Releases unpublished private values when their invocation publishes or is cancelled. */
	clear(): void {
		this.values = undefined;
	}

	/** Reads a private cell or invokes its brand-checked reader on the original native receiver. */
	read<Owner extends object, Value>(
		owner: Owner,
		key: object,
		read: (target: Owner) => Value
	): Value {
		const raw = unwrap(owner),
			cells = this.values?.get(raw);
		return cells?.has(key) ? (cells.get(key) as Value) : read(raw);
	}

	/** Stages a captured private value for all retained owners while preserving the assignment result. */
	write<Owner extends object, Value>(
		stage: (mutation: () => void) => void,
		publication: PendingStatePublication,
		owner: Owner,
		key: object,
		value: Value,
		write: (target: Owner, value: Value) => void,
		read: (target: Owner) => Value
	): Value {
		const raw = unwrap(owner);
		let cells = this.values?.get(raw);
		if (!cells) (this.values ??= new WeakMap()).set(raw, (cells = new Map()));
		cells.set(key, value);
		stage(() => publishPendingPrivateValue(publication, owner, value, write, read));
		return value;
	}
}

/** Publishes branded storage with a native inverse so a later failure restores private values and accessor caches. */
export function publishPendingPrivateValue<Owner extends object, Value>(
	publication: PendingStatePublication,
	owner: Owner,
	value: Value,
	write: (target: Owner, value: Value) => void,
	read: (target: Owner) => Value
): void {
	publication.visitOwners(owner, (target) => {
		const raw = unwrap(target) as Owner;
		if (hasActiveTransaction()) {
			const previous = read(raw);
			recordTransactionUndo((restoration) => {
				write(raw, previous);
				restoreReactiveAccessorWrite(raw, restoration);
			});
		}
		write(raw, value);
		notifyReactivePrivateWrite(target);
	});
}
