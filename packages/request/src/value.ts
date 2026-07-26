import { createContext } from '@exactjs/core';
import {
	RequestResponseCommittedError,
	type RequestContextInput,
	type RequestContextValue,
	type RequestResponseState
} from './contracts.js';

/** Publishes normalized request data through the component context hierarchy. */
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
	const publicOrigin =
		input.publicOrigin === undefined ? undefined : normalizePublicOrigin(input.publicOrigin);
	const supplied = new URL(
		input.url instanceof URL ? input.url.href : (input.url ?? '/'),
		'http://exact.invalid'
	);
	const url = new URL(
		`${supplied.pathname}${supplied.search}`,
		publicOrigin ?? 'http://exact.invalid'
	);
	const setStatus = (status: number) => {
		assertResponseMutable(response);
		if (!Number.isInteger(status) || status < 100 || status > 999) {
			throw new RangeError(`Invalid HTTP status ${status}`);
		}
		response.status = status;
	};
	return {
		url,
		...(publicOrigin === undefined ? {} : { publicOrigin: new URL(publicOrigin) }),
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
			// Preserve authored relative redirects. Turning them into absolute
			// locations would make request-controlled authority data observable.
			response.headers.set('location', location instanceof URL ? location.href : location);
		},
		setStatus,
		setHeader(name, value) {
			assertResponseMutable(response);
			response.headers.set(name, value);
		}
	};
}

/** Validates an application-owned externally visible HTTP origin. */
function normalizePublicOrigin(value: string | URL): URL {
	const origin = new URL(value);
	if (
		(origin.protocol !== 'http:' && origin.protocol !== 'https:') ||
		origin.username ||
		origin.password ||
		origin.pathname !== '/' ||
		origin.search ||
		origin.hash
	) {
		throw new TypeError(
			'publicOrigin must be an HTTP(S) origin without credentials, path, or query'
		);
	}
	return new URL(origin.origin);
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
