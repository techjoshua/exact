import { createContext, type Child, type Component } from '@exact/core';

/** Defines the request context value type contract. */
export type RequestContextValue = {
	url: URL;
	method: string;
	headers: Headers;
	signal: AbortSignal;
	locale?: string;
	traceId?: string;
	redirect(location: string | URL, status?: number): void;
	setStatus(status: number): void;
	setHeader(name: string, value: string): void;
};

/** Defines the request context input type contract. */
export type RequestContextInput = {
	url?: string | URL;
	method?: string;
	headers?: Headers | Record<string, string | readonly string[] | undefined>;
	signal?: AbortSignal;
	locale?: string;
	traceId?: string;
};

/** Tracks the state owned by request response. */
export type RequestResponseState = {
	status?: number;
	redirect?: { location: URL; status: number };
	headers: Headers;
	committed: boolean;
};

/** Represents a failure raised by request response committed. */
export class RequestResponseCommittedError extends Error {
	constructor() {
		super('Cannot mutate an eXact response after its status and headers are committed');
		this.name = 'RequestResponseCommittedError';
	}
}

/** Defines the request context storage interface contract. */
export interface RequestContextStorage {
	run<T>(value: RequestContextValue, callback: () => T): T;
	getStore(): RequestContextValue | undefined;
}

/** Defines the request scope interface contract. */
export interface RequestScope {
	run<T>(value: RequestContextValue, callback: () => T): T;
	current(): RequestContextValue | undefined;
}

/** Provides the canonical request context value. */
export const RequestContext = createContext<RequestContextValue>('exact.request', {
	global: true,
	reactive: false,
	scope: 'request'
});

/** Normalizes adapter-specific request data into eXact's portable contract. */
export function createRequestContextValue(
	input: RequestContextInput,
	response: RequestResponseState = { headers: new Headers(), committed: false }
): RequestContextValue {
	const signal = input.signal ?? new AbortController().signal;
	const headers = normalizeHeaders(input.headers);
	const baseUrl = `${headers.get('x-forwarded-proto') ?? 'http'}://${headers.get('host') ?? 'exact.local'}`;
	const url = input.url instanceof URL ? new URL(input.url) : new URL(input.url ?? '/', baseUrl);
	const setStatus = (status: number) => {
		assertResponseMutable(response);
		if (!Number.isInteger(status) || status < 100 || status > 999) {
			throw new RangeError(`Invalid HTTP status ${status}`);
		}
		response.status = status;
	};
	return {
		url,
		method: (input.method ?? 'GET').toUpperCase(),
		headers,
		signal,
		...(input.locale === undefined ? {} : { locale: input.locale }),
		...(input.traceId === undefined ? {} : { traceId: input.traceId }),
		redirect(location, status = 302) {
			if (!Number.isInteger(status) || status < 300 || status > 399) {
				throw new RangeError(`Invalid HTTP redirect status ${status}`);
			}
			setStatus(status);
			const target = location instanceof URL ? new URL(location) : new URL(location, url);
			response.redirect = { location: target, status };
			response.headers.set('location', target.href);
		},
		setStatus,
		setHeader(name, value) {
			assertResponseMutable(response);
			response.headers.set(name, value);
		}
	};
}

/** Freezes request-owned response controls at the transport commit boundary. */
export function commitRequestResponseState(response: RequestResponseState): Readonly<{
	status?: number;
	redirect?: { location: URL; status: number };
	headers: Headers;
}> {
	response.committed = true;
	return {
		...(response.status === undefined ? {} : { status: response.status }),
		...(response.redirect === undefined
			? {}
			: {
					redirect: {
						location: new URL(response.redirect.location),
						status: response.redirect.status
					}
				}),
		headers: new Headers(response.headers)
	};
}

function assertResponseMutable(response: RequestResponseState): void {
	if (response.committed) throw new RequestResponseCommittedError();
}

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

/** Creates a request scope. */
export function createRequestScope(
	storage: RequestContextStorage = new StackStorage()
): RequestScope {
	return {
		run: (value, callback) => storage.run(value, callback),
		current: () => storage.getStore()
	};
}

/** Installs the ambient storage used by runWithRequestContext and Router SSR lookup. */
export function configureRequestContextStorage(storage: RequestContextStorage): void {
	defaultStorage = storage;
}

/** Runs with request context with the supplied execution context. */
export function runWithRequestContext<T>(
	value: RequestContextValue,
	callback: () => T,
	scope?: RequestScope
): T {
	return scope ? scope.run(value, callback) : defaultStorage.run(value, callback);
}

/** Resolves a request context. */
export function getRequestContext(scope?: RequestScope): RequestContextValue | undefined {
	return scope ? scope.current() : defaultStorage.getStore();
}

/** Defines the properties accepted by request provider. */
export type RequestProviderProps = {
	value?: RequestContextValue;
	children?: Child | Child[];
};

/** Publishes an explicit or ambient request value to descendant components. */
export function RequestProvider(this: Component<{}>, props: RequestProviderProps) {
	const value = props.value ?? getRequestContext();
	if (!value)
		throw new Error('RequestProvider requires an explicit value or active ambient request context');
	this.setContext(RequestContext, value);
	return () => props.children;
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		!!value &&
		(typeof value === 'object' || typeof value === 'function') &&
		typeof (value as PromiseLike<unknown>).then === 'function'
	);
}

function normalizeHeaders(input: RequestContextInput['headers']): Headers {
	if (input instanceof Headers) return new Headers(input);
	const headers = new Headers();
	for (const [name, value] of Object.entries(input ?? {})) {
		if (value === undefined) continue;
		if (Array.isArray(value)) {
			for (const item of value) headers.append(name, item);
		} else {
			headers.set(name, value as string);
		}
	}
	return headers;
}
