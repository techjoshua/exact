import { exactResponseToBunResponse } from '@exactjs/bun-adapter';
import { createExactBufferedResponse } from '@exactjs/server';
import { renderParticipant } from './server-entry.jsx';
import type { InitialData } from './types.js';

const headers = {
	'cache-control': 'no-store',
	'content-type': 'text/html; charset=utf-8'
};
const documentStart =
	'<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="framework-participant" content="exact"><title>Incident Operations</title></head><body><div id="app" data-render-mode="ssr">';
const documentEnd = '</div></body></html>';

/** Renders the participant through eXact's compiler-buffered native Bun response lane. */
export function renderParticipantBunResponse(initialData: InitialData, path: string): Response {
	const rendered = renderParticipant(initialData, path);
	return exactResponseToBunResponse(
		createExactBufferedResponse(200, headers, [documentStart, rendered, documentEnd])
	);
}
