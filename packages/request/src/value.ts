import { createContext } from '@exact/core';
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
