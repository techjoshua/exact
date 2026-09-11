import { renderParticipant, renderParticipantStream } from './server-entry.js';
import type { DocumentOptions } from './Document.js';
import type { InitialData } from './types.js';

/** Serves the selected React rendering API without adding a harness-owned document shell. */
export async function renderParticipantBunResponse(
	initialData: InitialData,
	path: string,
	signal?: AbortSignal,
	options?: DocumentOptions,
	mode: 'string' | 'stream' = 'string'
) {
	const body =
		mode === 'stream'
			? await renderParticipantStream(initialData, path, options, signal)
			: renderParticipant(initialData, path, options);
	return new Response(body, {
		headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
	});
}
