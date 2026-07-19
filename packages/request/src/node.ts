import { AsyncLocalStorage } from 'node:async_hooks';
import {
	configureRequestContextStorage,
	createRequestScope,
	type RequestContextStorage,
	type RequestContextValue,
	type RequestScope
} from './index.js';

export function createNodeRequestStorage(): RequestContextStorage {
	const storage = new AsyncLocalStorage<RequestContextValue>();
	return {
		run: (value, callback) => storage.run(value, callback),
		getStore: () => storage.getStore()
	};
}

export function createNodeRequestScope(): RequestScope {
	return createRequestScope(createNodeRequestStorage());
}

/** Installs concurrency-safe Node request storage for the default ambient helpers. */
export function installNodeRequestContext(): RequestScope {
	const storage = createNodeRequestStorage();
	configureRequestContextStorage(storage);
	return createRequestScope(storage);
}
