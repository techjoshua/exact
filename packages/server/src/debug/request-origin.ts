import { createRequestContextValue } from '@exactjs/request';
import type { ExactRequestLike, ExactServerContext } from '../types.js';

const requestOrigins = new WeakMap<ExactRequestLike, string | undefined>();

/** Carries the already resolved scope origin without changing authorizer-visible request fields. */
export function scopedDebugRequest(
	request: ExactRequestLike,
	publicOrigin: URL | undefined
): ExactRequestLike {
	const scoped = { ...request };
	requestOrigins.set(scoped, publicOrigin?.origin);
	return scoped;
}

/** Resolves trusted configuration or an absolute transport URL, never a caller's Origin header. */
export function debugRequestOrigin(
	request: ExactRequestLike,
	context: ExactServerContext
): string | undefined {
	if (requestOrigins.has(request))
		return requestOrigins.get(request) ?? absoluteOrigin(request.url);
	const configured = context.publicOrigin;
	const value =
		typeof configured === 'function'
			? configured({
					url: request.url,
					headers: request.headers,
					platformRequest: request.platformRequest ?? context.platformRequest
				})
			: configured;
	return value === undefined
		? absoluteOrigin(request.url)
		: createRequestContextValue({ publicOrigin: value }).publicOrigin?.origin;
}

function absoluteOrigin(value: string | URL | undefined): string | undefined {
	if (!value) return undefined;
	const url = new URL(value);
	return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password
		? url.origin
		: undefined;
}
