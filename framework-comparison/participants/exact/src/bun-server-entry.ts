import { exactResponseToBunResponse } from '@exactjs/bun-adapter';
import { renderParticipantResponse, type ParticipantRenderOptions } from './server-entry.jsx';
import type { InitialData } from './types.js';

/** Adapts the shared public eXact response to Bun's native Fetch transport. */
export async function renderParticipantBunResponse(
	initialData: InitialData,
	path: string,
	signal?: AbortSignal,
	options?: ParticipantRenderOptions,
	mode: 'string' | 'stream' = 'string'
): Promise<Response> {
	return exactResponseToBunResponse(
		await renderParticipantResponse(initialData, path, { ...options, signal }, mode)
	);
}
