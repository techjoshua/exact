import type { PendingReactiveState } from './pending-state-contract.js';
import { registerPendingReactiveHelper } from './helper-variants.js';

/** Retains selected collection method identity without leaking ordinary reactive bound wrappers into pending execution. */
export class PendingCollectionMembers {
	private readonly receivers = new WeakMap<
		object,
		Map<PropertyKey, { original: unknown; bound: (...args: unknown[]) => unknown }>
	>();

	/** Selects the authored operation once, before arguments, while its captured receiver retains invocation ownership. */
	select(
		context: PendingReactiveState,
		receiver: object,
		key: PropertyKey,
		original: unknown
	): (...args: unknown[]) => unknown {
		let members = this.receivers.get(receiver);
		const previous = members?.get(key);
		if (previous && previous.original === original) return previous.bound;
		if (!members) this.receivers.set(receiver, (members = new Map()));
		const selected = context.method(receiver, key, original);
		// A later helper or call/apply selection must not wrap these inputs a second time.
		const bound = registerPendingReactiveHelper(selected, (_invocation, ...args) =>
			selected(...args)
		);
		members.set(key, { original, bound });
		return bound;
	}
}
