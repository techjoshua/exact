import { isPromiseLike } from '../component/async-value.js';

/**
 * Releases a task-owned object through its callable standard disposal method.
 * Async disposal takes precedence, including when it completes synchronously.
 * An absent or noncallable async member permits callable synchronous disposal.
 * Each selected getter is read once and the method keeps its original receiver.
 * Missing disposal methods throw instead of silently abandoning the resource.
 */
export function disposeSymbolicTaskResource(resource: object): void | Promise<void> {
	const symbols = Symbol as SymbolConstructor & { asyncDispose?: symbol; dispose?: symbol };
	const asynchronous: unknown = symbols.asyncDispose
		? Reflect.get(resource, symbols.asyncDispose)
		: undefined;
	if (typeof asynchronous === 'function')
		return invokeDisposal(resource, asynchronous as () => unknown);
	const synchronous: unknown = symbols.dispose ? Reflect.get(resource, symbols.dispose) : undefined;
	if (typeof synchronous === 'function')
		return invokeDisposal(resource, synchronous as () => unknown);
	throw new TypeError(
		'Task resource must expose a callable Symbol.dispose or Symbol.asyncDispose method'
	);
}

/** Normalizes asynchronous cleanup without allocating a promise for synchronous disposal. */
function invokeDisposal(resource: object, method: () => unknown): void | Promise<void> {
	const result = method.call(resource);
	if (isPromiseLike(result)) return Promise.resolve(result).then(() => undefined);
}
