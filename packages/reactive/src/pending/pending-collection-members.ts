import type { PendingHelperContext } from './pending-helper-calls.js';

/** Retains selected collection method identity without leaking ordinary reactive bound wrappers into pending execution. */
export class PendingCollectionMembers {
	private readonly selected = new WeakSet<(...args: unknown[]) => unknown>();
	private readonly receivers = new WeakMap<
		object,
		Map<PropertyKey, { original: unknown; bound: (...args: unknown[]) => unknown }>
	>();

	/** Selects the authored operation once, before arguments, while its captured receiver retains invocation ownership. */
	select(
		context: PendingHelperContext,
		receiver: object,
		key: PropertyKey,
		original: unknown
	): (...args: unknown[]) => unknown {
		let members = this.receivers.get(receiver);
		const previous = members?.get(key);
		if (previous && previous.original === original) return previous.bound;
		if (!members) this.receivers.set(receiver, (members = new Map()));
		const selected = context.method(receiver, key, original);
		const bound = selected;
		this.selected.add(bound);
		members.set(key, { original, bound });
		return bound;
	}

	/** Recognizes only native adapters selected by this invocation, preserving their bound receiver. */
	has(value: unknown): value is (...args: unknown[]) => unknown {
		return (
			typeof value === 'function' && this.selected.has(value as (...args: unknown[]) => unknown)
		);
	}
}
