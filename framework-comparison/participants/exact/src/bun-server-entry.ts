import { exactResponseToBunResponse } from '@exactjs/bun-adapter';
import { createExactBufferedResponse } from '@exactjs/server';
import {
	renderParticipant,
	renderParticipantStream,
	type ParticipantRenderOptions
} from './server-entry.jsx';
import type { InitialData } from './types.js';

const headers = {
	'cache-control': 'no-store',
	'content-type': 'text/html; charset=utf-8'
};

/** Renders the complete document through the selected string or streaming API on native Bun. */
export async function renderParticipantBunResponse(
	initialData: InitialData,
	path: string,
	signal?: AbortSignal,
	options?: ParticipantRenderOptions,
	mode: 'string' | 'stream' = 'string'
): Promise<Response> {
	if (mode === 'stream')
		return exactResponseToBunResponse({
			status: 200,
			headers,
			stream: renderParticipantStream(initialData, path, options, signal)
		});
	const rendered = await renderParticipant(initialData, path, options);
	return exactResponseToBunResponse(createExactBufferedResponse(200, headers, [rendered]));
}
