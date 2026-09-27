import { isPromiseLike } from '@exactjs/core/framework/async-values';
import type { RequestContextStorage, RequestContextValue, RequestScope } from './contracts.js';

class StackStorage implements RequestContextStorage {
	private readonly stack: RequestContextValue[] = [];

	run<T>(value: RequestContextValue, callback: () => T): T {
		this.stack.push(value);
		try {
			const result = callback();
			if (isPromiseLike(result)) {
				void Promise.resolve(result).catch(() => undefined);
				throw new Error(
					'The default eXact request storage is synchronous; configure async-safe storage before using an async request scope'
				);
			}
			return result;
		} finally {
			this.stack.pop();
		}
	}

	getStore(): RequestContextValue | undefined {
		return this.stack.at(-1);
	}
}

let defaultStorage: RequestContextStorage = new StackStorage();

/**
 * Creates an independent scope for accessing the active request value.
 * The default storage supports synchronous callbacks only and rejects promise-returning work.
 * Asynchronous request handling needs async-safe storage supplied by the runtime integration.
 */
export function createRequestScope(
	storage: RequestContextStorage = new StackStorage()
): RequestScope {
	return {
		run: (value, callback) => storage.run(value, callback),
		current: () => storage.getStore()
	};
}

/** Installs the ambient storage used by request execution and router SSR lookup. */
export function configureRequestContextStorage(storage: RequestContextStorage): void {
	defaultStorage = storage;
}

/**
 * Makes `value` available through `getRequestContext` while the callback runs in the selected
 * scope, or the configured default storage when no scope is supplied. Async callbacks require
 * async-safe storage. The built-in synchronous storage throws if the callback returns a promise.
 */
export function runWithRequestContext<T>(
	value: RequestContextValue,
	callback: () => T,
	scope?: RequestScope
): T {
	return scope ? scope.run(value, callback) : defaultStorage.run(value, callback);
}

/** Returns the request value active in the selected or default scope. */
export function getRequestContext(scope?: RequestScope): RequestContextValue | undefined {
	return scope ? scope.current() : defaultStorage.getStore();
}
