import { selectNativeOperation } from '../internal/native-operations.js';
import { registerPendingReactiveHelper } from './helper-variants.js';
import { unwrap } from '../internal/values.js';
import type { PendingReactiveState } from './pending-state-contract.js';
import type { PendingHelperContext } from './pending-helper-calls.js';

/** Recognizes selected native methods without passing a pending facade to their brand-checked implementation. */
export function selectPendingNativeMethod(
	context: PendingReactiveState,
	original: unknown,
	receiver: unknown
): ((...args: unknown[]) => unknown) | undefined {
	if (typeof original !== 'function' || !receiver || typeof receiver !== 'object') return undefined;
	const native = selectNativeOperation(original, unwrap(receiver));
	if (!native || native.kind === 'date') return undefined;
	return context.method(receiver, native.key, original);
}

/** Routes actual Function prototype operations through the same helper selection as ordinary calls. */
export function selectPendingHelperInvocation(
	context: PendingHelperContext,
	original: unknown,
	receiver: unknown
): ((...args: unknown[]) => unknown) | undefined {
	if (typeof receiver !== 'function') return undefined;
	if (original === Function.prototype.call)
		return (owner, ...args) => context.helper(receiver, owner)(...args);
	if (original === Function.prototype.apply)
		return (owner, args) =>
			Reflect.apply(
				context.helper(receiver, owner),
				undefined,
				args == null ? [] : (args as ArrayLike<unknown>)
			);
	if (original === Function.prototype.bind)
		return (owner, ...prefix) => {
			const bound = Reflect.apply(Function.prototype.bind, receiver, [owner, ...prefix]);
			const selectedOwner = context.receiverAlias(owner);
			const selectedPrefix = prefix.map((value) => context.receiverAlias(value));
			// The bound callable retains native name, arity and ordinary execution. Its companion
			// selects the eventual invocation's context, rather than retaining this transaction.
			return registerPendingReactiveHelper(bound, (invocation, ...args) =>
				invocation.helper(receiver, selectedOwner)(...selectedPrefix, ...args)
			);
		};
	return undefined;
}
