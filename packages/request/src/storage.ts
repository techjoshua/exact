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

/** Creates an isolated request scope backed by the supplied storage implementation. */
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

/** Runs a callback with an ambient request value owned by the selected scope. */
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

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		!!value &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as PromiseLike<unknown>).then === 'function'
	);
}
