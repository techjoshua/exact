/** Describes the normalized request information exposed to components. */
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

/** Accepts adapter-specific request values before normalization. */
export type RequestContextInput = {
	url?: string | URL;
	method?: string;
	headers?: Headers | Record<string, string | readonly string[] | undefined>;
	signal?: AbortSignal;
	locale?: string;
	traceId?: string;
};

/** Tracks response controls until the transport commits them. */
export type RequestResponseState = {
	status?: number;
	redirect?: { location: URL; status: number };
	headers: Headers;
	committed: boolean;
};

/** Reports an attempt to mutate response controls after transport commitment. */
export class RequestResponseCommittedError extends Error {
	constructor() {
		super('Cannot mutate an eXact response after its status and headers are committed');
		this.name = 'RequestResponseCommittedError';
	}
}

/** Stores an ambient request value for the lifetime of one callback. */
export interface RequestContextStorage {
	run<T>(value: RequestContextValue, callback: () => T): T;
	getStore(): RequestContextValue | undefined;
}

/** Provides explicit ownership of an isolated request-context stack. */
export interface RequestScope {
	run<T>(value: RequestContextValue, callback: () => T): T;
	current(): RequestContextValue | undefined;
}
