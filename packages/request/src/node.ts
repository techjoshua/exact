import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestContextStorage, RequestContextValue, RequestScope } from './contracts.js';
import { configureRequestContextStorage, createRequestScope } from './storage.js';

/** Creates a node request storage. */
export function createNodeRequestStorage(): RequestContextStorage {
	const storage = new AsyncLocalStorage<RequestContextValue>();
	return {
		run: (value, callback) => storage.run(value, callback),
		getStore: () => storage.getStore()
	};
}

/** Creates a node request scope. */
export function createNodeRequestScope(): RequestScope {
	return createRequestScope(createNodeRequestStorage());
}

/** Installs concurrency-safe Node request storage for the default ambient helpers. */
export function installNodeRequestContext(): RequestScope {
	const storage = createNodeRequestStorage();
	configureRequestContextStorage(storage);
	return createRequestScope(storage);
}
