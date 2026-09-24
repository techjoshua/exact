import type { ExactResponseLike } from '../types.js';

/** Converts response headers for Fetch hosts while preserving separate Set-Cookie fields. */
export function exactResponseHeaders(response: ExactResponseLike): Headers {
	const headers = new Headers(response.headers);
	for (const cookie of response.setCookies ?? []) headers.append('set-cookie', cookie);
	return headers;
}
