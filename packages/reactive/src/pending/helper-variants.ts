import type { PendingReactiveState } from './pending-state-contract.js';

/** Erases callable parameters only at the compiler registry, preserving the original public callable. */
type HelperCallable = (...args: never[]) => unknown;

/** A companion uses explicit invocation ownership while its original retains ordinary call semantics. */
export interface PendingReactiveHelperVariant {
	work: (context: PendingReactiveState, ...args: never[]) => unknown;
	rawReceiver: boolean;
	/** Only destructured parameter inputs need facades before native parameter binding runs. */
	pendingParameters?: readonly number[];
	/** Original method home object, retained independently of the mutable class name or receiver subclass. */
	home?: object;
}

const variants = new WeakMap<HelperCallable, PendingReactiveHelperVariant>();

/**
 * Records a compiler-owned companion and returns the original callable unchanged. Class companions
 * select the raw native receiver to retain private brands. Registration never executes helper work.
 * The optional inferred name preserves source name inference when a generated registration wraps
 * an anonymous initializer. A private method may inherit its lexical home from an already
 * registered companion. Public parameters, defaults, arity and identity remain unchanged.
 */
export function registerPendingReactiveHelper<Callable extends HelperCallable>(
	original: Callable,
	work: PendingReactiveHelperVariant['work'],
	rawReceiver = false,
	inferredName?: string,
	pendingParameters?: readonly number[],
	home?: object
): Callable {
	if (inferredName !== undefined && original.name === '')
		Object.defineProperty(original, 'name', { value: inferredName, configurable: true });
	variants.set(original, {
		work,
		rawReceiver,
		pendingParameters,
		home: home ?? (rawReceiver ? variants.get(work as HelperCallable)?.home : undefined)
	});
	return original;
}

/** Resolves an existing companion without executing a getter or accepting a non-callable value. */
export function pendingReactiveHelperVariant(
	original: unknown
): PendingReactiveHelperVariant | undefined {
	return typeof original === 'function' ? variants.get(original as HelperCallable) : undefined;
}
