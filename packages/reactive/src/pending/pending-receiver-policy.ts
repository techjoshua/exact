import { unwrap } from '../internal/values.js';

/** Retains explicit receiver aliases through branded calls without imposing one alias on another. */
export interface PendingReceiverPolicy {
	readonly raw: object;
	readonly receiver: object;
	readonly previous?: PendingReceiverPolicy;
}

/** Retains lexical receiver policy for raw this while honoring an explicitly selected proxy. */
export function pendingReceiverPolicy(
	previous: PendingReceiverPolicy | undefined,
	receiver: object
): PendingReceiverPolicy {
	return {
		raw: unwrap(receiver),
		receiver: selectPendingReceiverAlias(previous, receiver),
		previous
	};
}

/** Selects the most recent matching receiver policy without traversing untouched state storage. */
export function selectPendingReceiverAlias(
	policy: PendingReceiverPolicy | undefined,
	target: object
): object {
	const raw = unwrap(target);
	if (target !== raw) return target;
	for (let current = policy; current; current = current.previous)
		if (current.raw === raw) return current.receiver;
	return target;
}
