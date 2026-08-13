import { loadIncidentData } from '$lib/service-client.js';

export async function load({ fetch, url }: { fetch: typeof globalThis.fetch; url: URL }) {
	return { ...(await loadIncidentData(fetch)), path: url.pathname };
}
