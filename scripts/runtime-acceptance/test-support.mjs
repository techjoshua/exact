import assert from 'node:assert/strict';

/** Bounds every HTTP operation, including metadata and failure probes. */
export const request = (url, options = {}) =>
	globalThis.fetch(url, { signal: AbortSignal.timeout(10000), ...options });

/** Reads framework JSON without hiding failed transport statuses. */
export async function json(response, status = 200) {
	const text = await response.text();
	assert.equal(response.status, status, text);
	return JSON.parse(text);
}
