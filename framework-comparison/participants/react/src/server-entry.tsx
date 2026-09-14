import { renderToString, renderToReadableStream } from 'react-dom/server';
import { Document, type DocumentOptions } from './Document.js';
import type { InitialData } from './types.js';

/** Streams the same complete document through React's Web Stream API on either runtime. */
export function renderParticipantStream(
	initialData: InitialData,
	path: string,
	options?: DocumentOptions,
	signal?: AbortSignal
) {
	return renderToReadableStream(<Document initialData={initialData} path={path} {...options} />, {
		signal
	});
}

/** Server-renders the React participant from one authoritative controlled-service snapshot. */
export function renderParticipant(
	initialData: InitialData,
	path: string,
	options?: DocumentOptions
) {
	return (
		'<!doctype html>' +
		renderToString(<Document initialData={initialData} path={path} {...options} />)
	);
}
